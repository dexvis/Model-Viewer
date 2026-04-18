import { useEffect, useState, useRef, forwardRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import * as rootUtils from './rootUtils';
import { Perf } from 'r3f-perf'

function CameraController({ target, fileType }: { target: THREE.Object3D | null; fileType: 'gltf' | 'root' | null }) {
  const { camera } = useThree();
  
  useEffect(() => {
    if (!target) return;
    
    setTimeout(() => {
      
      const box = new THREE.Box3().setFromObject(target);
      
      if (box.isEmpty()) {
        setTimeout(() => {
          const boxRetry = new THREE.Box3().setFromObject(target);
          if (!boxRetry.isEmpty()) {
            adjustCamera(boxRetry);
          }
        }, 100);
        return;
      }
      
      adjustCamera(box);
    }, 50);
    
    function adjustCamera(box: THREE.Box3) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      
      let distance: number;
      if (fileType === 'gltf') {
        distance = maxDim * 0.4;  
      } else {
        distance = maxDim * 0.4;
      }
      
      camera.position.set(
        center.x + distance * 0.4,  
        center.y + distance * 0.6,
        center.z + distance
      );
      
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      
      
      const controls = (window as any).controls;
      if (controls) {
        controls.target.copy(center);
        controls.update();
      }
    }
  }, [target, camera, fileType]);
  
  return null;
}

const GLTFViewer = forwardRef<THREE.Group, { url: string; onLoaded?: () => void }>(({ url, onLoaded }, ref) => {
  const { scene } = useGLTF(url);
  
  useEffect(() => {
    if (scene && onLoaded) {
     
      setTimeout(onLoaded, 100);
    }
  }, [scene, onLoaded]);
  
  return <primitive object={scene} ref={ref} />;
});

function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const [fileParam, setFileParam] = useState<string | null>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState('');
  const [fileType, setFileType] = useState<'gltf' | 'root' | null>(null);
  const gltfRef = useRef<THREE.Group>(null);
  

  useEffect(() => {
    let file = urlParams.get('file');
    if (!file) {
      file = 'my.root';
      const newUrl = `${window.location.pathname}?file=${file}`;
      window.history.replaceState({}, '', newUrl);
    }
    setFileParam(file);
  }, []);

  useEffect(() => {
    if (!fileParam) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setProgress('');
      
      const ext = fileParam.split('.').pop()?.toLowerCase();
      if (ext === 'gltf' || ext === 'glb') {
        setFileType('gltf');
        setLoading(false);
      } else if (ext === 'root') {
        setFileType('root');
        try {
          const geometry = await rootUtils.loadRootGeometry(fileParam, (msg) => setProgress(msg));
          if (mounted) {
            setScene(geometry);
            setLoading(false);
          }
        } catch (err: any) {
          if (mounted) {
            setLoading(false);
          }
        }
      } else {
        setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [fileParam]);

  const targetObject = fileType === 'root' ? scene : gltfRef.current;

  if (loading && fileType === 'root') {
    return (
      <div style={{ color: 'white', background: '#111', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <div>Loading ROOT...</div>
        <div style={{ fontSize: 12, marginTop: 8 }}>{progress}</div>
      </div>
    );
  }
 
  if (fileType === 'gltf' && !fileParam) {
    return <div style={{ color: 'white', background: '#111',
       height: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center' }}>Loading GLTF...</div>;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111' }}>
      <Canvas camera={{ far: 50000 }}>
        <Perf position="top-left" /> 
        <CameraController target={targetObject} fileType={fileType} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[1000, 1000, 1000]} intensity={1} />
        <directionalLight position={[-1000, -1000, -1000]} intensity={0.3} />
        {fileType === 'root' && scene && <primitive object={scene} />}
        {fileType === 'gltf' && fileParam && (
          <GLTFViewer 
            ref={gltfRef} 
            url={fileParam}
            
          />
        )}
        <OrbitControls 
          makeDefault 
          enableZoom 
          enablePan 
          enableRotate
          zoomSpeed={1.2}
          panSpeed={0.8}
          rotateSpeed={1.0}
        />
      </Canvas>
      <div style={{ position: 'absolute', bottom: 20,
         left: 20, color: 'white', background: 'rgba(0,0,0,0.7)',
          padding: '8px 12px', borderRadius: 5, fontSize: 12 }}>
        {fileType === 'root' ? ` ROOT: ${fileParam}` : ` GLTF: ${fileParam}`}
      </div>
    </div>
  );
}

export default App;