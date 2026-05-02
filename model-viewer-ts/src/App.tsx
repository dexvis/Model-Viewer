import { useEffect, useState, useRef, useMemo, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import { loadRootGeometry } from './rootUtils';
import { prepareForExport } from './sceneUtils';

export function LoadingScreen({ progressRef }: { progressRef: React.MutableRefObject<string> }) {
  const [progress, setProgress] = useState('');
  useEffect(() => {
    const interval = setInterval(() => setProgress(progressRef.current), 50);
    return () => clearInterval(interval);
  }, [progressRef]);
  return (
    <div style={{ color: 'white', background: '#111', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <div>Loading Geometry...</div>
      <div style={{ fontSize: 12, marginTop: 8, color: '#888' }}>{progress}</div>
    </div>
  );
}

export function GltfModel({ url, onReady }: { url: string; onReady: (scene: THREE.Group) => void }) {
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

  const hiddenPaths = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const hideParam = params.get('hide');
    if (!hideParam) return [];
    return hideParam.split(',').map(pattern => {
      if (pattern.includes('*')) {
        return new RegExp(pattern.replace(/\*/g, '.*'));
      }
      return pattern;
    });
  }, []);

  const maxLevel = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const level = parseInt(params.get('maxLevel') || '20');
    return isNaN(level) ? 20 : Math.min(level, 30);
  }, []);

  const fullPath = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('fullPath') === 'true';
  }, []);

  const fileType = useMemo(() => {
    const ext = fileParam.split('.').pop()?.toLowerCase();
    return ext === 'gltf' || ext === 'glb' ? 'gltf' : ext === 'root' ? 'root' : null;
  }, [fileParam]);

  const [modelGroup, setModelGroup] = useState<THREE.Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dpr, setDpr] = useState(1.5);
  const [infoVisible, setInfoVisible] = useState(false);
  const [geometryInfo, setGeometryInfo] = useState<any>(null);
  const progressRef = useRef<string>('');
  const activeGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (fileType !== 'root') {
      if (fileType === 'gltf') setLoading(false);
      else if (!fileType) setError(`Unsupported file type: ${fileParam.split('.').pop()}`);
      return;
    }
    
    let mounted = true;
    (async () => {
      try {
        const geometry = await loadRootGeometry(
          fileParam, 
          (msg) => { progressRef.current = msg; },
          hiddenPaths,
          maxLevel,
          fullPath
        );
        
        if (mounted) {
          setModelGroup(geometry);
          activeGroupRef.current = geometry;
          
          let meshCount = 0;
          geometry.traverse((obj: any) => { if (obj.isMesh) meshCount++; });
          setGeometryInfo({
            totalMeshes: meshCount,
            rootChildren: geometry.children.length,
            hiddenPatterns: hiddenPaths.map(p => p.toString()),
            maxLevel,
            fullPath
          });
        }
      } catch (err: any) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    
    return () => { mounted = false; };
  }, [fileParam, fileType, hiddenPaths, maxLevel, fullPath]);

  const handleGltfReady = useCallback((scene: THREE.Group) => {
    activeGroupRef.current = scene;
  }, []);

  const handleExport = useCallback(() => {
    const source = activeGroupRef.current;
    if (!source) return;
    
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
        link.download = `export_${Date.now()}.gltf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      },
      (error) => console.error('Export error:', error),
      { binary: false, onlyVisible: false }
    );
  }, []);

  
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        setInfoVisible(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  if (loading) return <LoadingScreen progressRef={progressRef} />;
  if (error) return <div style={{ color: 'white', background: '#111', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Error: {error}</div>;

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111', position: 'relative' }}>
      {/* BUTTONS - TOP LEFT - WORKING */}
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, display: 'flex', gap: 10 }}>
        
        <button 
          onClick={handleExport} 
          style={{ 
            padding: '10px 20px', 
            background: '#4caf50', 
            color: 'white', 
            border: 'none', 
            borderRadius: 5, 
            cursor: 'pointer', 
            fontWeight: 'bold',
            fontSize: 14,
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            zIndex: 20
          }}
        >
          Export GLTF
        </button>
      </div>

     
      {infoVisible && geometryInfo && (
        <div style={{ 
          position: 'absolute', 
          top: 80, 
          left: 20, 
          zIndex: 10, 
          background: 'rgba(0,0,0,0.9)', 
          color: 'white', 
          padding: '15px 20px', 
          borderRadius: 8, 
          fontSize: 12, 
          fontFamily: 'monospace', 
          backdropFilter: 'blur(8px)', 
          border: '1px solid rgba(255,255,255,0.1)', 
          maxWidth: 350,
          pointerEvents: 'auto'
        }}>
          <button 
            onClick={() => setInfoVisible(false)} 
            style={{ 
              position: 'absolute', 
              top: 10, 
              right: 10, 
              background: 'none', 
              border: 'none', 
              color: '#aaa', 
              cursor: 'pointer', 
              fontSize: 18,
              fontWeight: 'bold'
            }}
          >
            ×
          </button>
          
          <div style={{ fontWeight: 'bold', marginBottom: 10, fontSize: 14 }}>📊 Geometry Info</div>
          <div>Meshes: {geometryInfo.totalMeshes}</div>
          <div>Root children: {geometryInfo.rootChildren}</div>
          <div>Max level: {geometryInfo.maxLevel}</div>
          <div>Full path: {geometryInfo.fullPath ? 'Yes' : 'No'}</div>
          
          {geometryInfo.hiddenPatterns.length > 0 && (
            <>
              <div style={{ fontWeight: 'bold', marginTop: 10, marginBottom: 5 }}>🎯 Hidden patterns:</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {geometryInfo.hiddenPatterns.map((p: string, i: number) => (
                  <li key={i} style={{ color: '#ffaa66', wordBreak: 'break-all' }}>{p}</li>
                ))}
              </ul>
            </>
          )}
          
          <div style={{ fontSize: 10, color: '#888', marginTop: 15, borderTop: '1px solid #333', paddingTop: 8 }}>
            💡 Press 'H' to hide/show this panel
          </div>
        </div>
      )}

      
      <Canvas 
        camera={{ position: [500, 500, 500], far: 50000 }} 
        style={{ background: '#111' }} 
        dpr={dpr} 
        frameloop="demand"
      >
        <PerformanceMonitor 
          onIncline={() => setDpr(2)} 
          onDecline={() => setDpr(1)} 
          flipflops={3} 
          iterations={1}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[1000, 1000, 1000]} intensity={1} />
          <directionalLight position={[-500, -500, -500]} intensity={0.3} />
          
          {fileType === 'root' && modelGroup && <primitive object={modelGroup} />}
          {fileType === 'gltf' && (
            <Suspense fallback={null}>
              <GltfModel url={fileParam} onReady={handleGltfReady} />
            </Suspense>
          )}
          
          <OrbitControls 
            enableDamping={false}
            rotateSpeed={1.0}
            zoomSpeed={1.2}
            panSpeed={0.8}
            makeDefault
          />
        </PerformanceMonitor>
      </Canvas>
    </div>
  );
}

export default App;