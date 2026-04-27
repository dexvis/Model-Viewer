import { useEffect, useState, useRef, useMemo, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { openFile, geoCfg } from 'jsroot';
import { build } from 'jsroot/geom';

// ---------- Утилиты для .root ----------
function matches(name: string, paths: (string | RegExp)[]): boolean {
  for (const p of paths) {
    if (typeof p === 'string') {
      if (name.startsWith(p)) return true;
    } else {
      if (name.match(p)) return true;
    }
  }
  return false;
}

function cleanupGeometry(
  node: any,
  hiddenPaths: (string | RegExp)[],
  maxLevel: number,
  fullPath: boolean,
  level = 0,
  path = '_'
) {
  if (node.fVolume?.fNodes) {
    path = path + node.fVolume.fName + '_';
    const nodes = node.fVolume.fNodes.arr;
    if (nodes) {
      const filtered = nodes.filter((n: any) => {
        if (level >= maxLevel) return false;
        const name = (fullPath ? path : '') + n.fName;
        return !matches(name, hiddenPaths);
      });
      node.fVolume.fNodes.arr = filtered;
      for (const snode of filtered) {
        cleanupGeometry(snode, hiddenPaths, maxLevel, fullPath, level + 1, path);
      }
    }
  }
}

async function findGeoManager(file: any): Promise<any> {
  if (!file || !file.fKeys) return null;
  for (const key of file.fKeys) {
    if (key.fClassName === 'TGeoManager') {
      const obj = await file.readObject(key.fName);
      if (obj && obj._typename === 'TGeoManager') return obj;
    }
  }
  return null;
}

function isMesh(obj: any): boolean {
  return obj && (obj.isMesh === true || obj.type === 'Mesh');
}

/** Плоская структура + оригинальные материалы */
function prepareForExport(group: THREE.Group): THREE.Group {
  const clone = group.clone(true) as THREE.Group;
  clone.updateWorldMatrix(true, true);

  const allMeshes: any[] = [];
  
  clone.traverse((obj: any) => {
    if (isMesh(obj) && obj.geometry) {
      allMeshes.push(obj);
    }
  });

  console.log(`Найдено ${allMeshes.length} мешей`);

  const exportGroup = new THREE.Group();
  exportGroup.name = 'Scene';

  allMeshes.forEach((mesh, index) => {
    // Новый меш с оригинальной геометрией и материалом
    const newMesh = new THREE.Mesh(mesh.geometry, mesh.material);
    
    // Применяем мировую матрицу
    newMesh.applyMatrix4(mesh.matrixWorld);
    
    // Сбрасываем трансформации
    newMesh.position.set(0, 0, 0);
    newMesh.quaternion.identity();
    newMesh.scale.set(1, 1, 1);
    newMesh.updateMatrix();
    newMesh.updateMatrixWorld();
    
    newMesh.name = mesh.name || `Mesh_${index}`;
    
    exportGroup.add(newMesh);
    
    if (index % 5000 === 0 && index > 0) {
      console.log(`  Обработано ${index}/${allMeshes.length} мешей`);
    }
  });

  console.log(`Готово: ${exportGroup.children.length} мешей`);
  return exportGroup;
}

async function loadRootGeometry(
  filePath: string,
  onProgress?: (msg: string) => void
): Promise<THREE.Group> {
  onProgress?.('Opening ROOT file...');
  const file = await openFile(filePath);

  onProgress?.('Searching for TGeoManager...');
  const geoManager = await findGeoManager(file);
  if (!geoManager) throw new Error('TGeoManager not found');

  const maxLevel = 20;
  const hiddenPaths: (string | RegExp)[] = [];
  const fullPath = false;
  const nFaces = 24;

  onProgress?.('Cleaning up geometry...');
  const masterNode = geoManager.fMasterVolume || geoManager.fVolume;
  if (masterNode?.fNodes?.arr?.[0]) {
    cleanupGeometry(masterNode.fNodes.arr[0], hiddenPaths, maxLevel, fullPath);
  }

  geoCfg('GradPerSegm', 360 / nFaces);

  onProgress?.('Building 3D model...');
  const group = await build(geoManager, {
    numfaces: 5000000,
    numnodes: 500000,
    dflt_colors: true,
    vislevel: 10,
    instancing: -1,
    transp: false,
  });

  if (!group?.children?.length) throw new Error('Empty geometry');
  return group;
}

const LoadingScreen = ({ progressRef }: { progressRef: React.MutableRefObject<string> }) => {
  const divRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const interval = setInterval(() => {
      if (divRef.current) divRef.current.textContent = progressRef.current;
    }, 50);
    return () => clearInterval(interval);
  }, [progressRef]);
  return (
    <div style={{ color: 'white', background: '#111', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <div>🔄 Loading...</div>
      <div ref={divRef} style={{ fontSize: 12, marginTop: 8, color: '#888' }} />
    </div>
  );
};

function GltfModel({ url, onReady }: { url: string; onReady: (scene: THREE.Group) => void }) {
  const { scene } = useGLTF(url);
  useEffect(() => {
    if (scene) onReady(scene);
  }, [scene, onReady]);
  return <primitive object={scene} />;
}

function App() {
  const fileParam = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    let file = params.get('file');
    if (!file) {
      file = 'my.root';
      window.history.replaceState({}, '', `${window.location.pathname}?file=${file}`);
    }
    return file;
  }, []);

  const fileType = useMemo(() => {
    const ext = fileParam.split('.').pop()?.toLowerCase();
    return ext === 'gltf' || ext === 'glb' ? 'gltf' : ext === 'root' ? 'root' : null;
  }, [fileParam]);

  const [modelGroup, setModelGroup] = useState<THREE.Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const progressRef = useRef<string>('');
  const activeGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (fileType !== 'root') {
      if (fileType === 'gltf') setLoading(false);
      else if (!fileType) setError(`Неподдерживаемый формат: ${fileParam.split('.').pop()}`);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const geometry = await loadRootGeometry(fileParam, (msg) => {
          progressRef.current = msg;
        });
        if (mounted) {
          setModelGroup(geometry);
          activeGroupRef.current = geometry;
        }
      } catch (err: any) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [fileParam, fileType]);

  const handleGltfReady = useCallback((scene: THREE.Group) => {
    activeGroupRef.current = scene;
  }, []);

  const handleExport = useCallback(() => {
    const source = activeGroupRef.current;
    if (!source) {
      alert('Сцена не загружена');
      return;
    }

    const toExport = prepareForExport(source);

    const exporter = new GLTFExporter();
    exporter.parse(
      toExport,
      (gltf) => {
        const jsonString = JSON.stringify(gltf);
        const blob = new Blob([jsonString], { type: 'model/gltf+json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'export.gltf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        console.log('✅ Экспортировано:', (blob.size / 1024).toFixed(1), 'KB');
      },
      (error) => {
        console.error('Ошибка:', error);
        alert('Ошибка: ' + error.message);
      },
      { binary: false, onlyVisible: false }
    );
  }, [fileType]);

  if (loading) return <LoadingScreen progressRef={progressRef} />;
  if (error) return <div style={{ color: '#ff6b6b', background: '#111', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>❌ {error}</div>;

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111', position: 'relative' }}>
      <button onClick={handleExport} style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 10, padding: '10px 20px', background: '#4caf50', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 'bold' }}>
        Export to GLTF
      </button>
      <Canvas camera={{ far: 50000 }} style={{ background: '#111' }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[1000, 1000, 1000]} intensity={1} />
        {fileType === 'root' && modelGroup && <primitive object={modelGroup} />}
        {fileType === 'gltf' && (
          <Suspense fallback={null}>
            <GltfModel url={fileParam} onReady={handleGltfReady} />
          </Suspense>
        )}
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}

export default App;