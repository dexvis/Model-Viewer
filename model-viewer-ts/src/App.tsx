import { Canvas } from '@react-three/fiber'
import { useGLTF, OrbitControls } from '@react-three/drei'
import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import './App.css'

function App() {
  const { scene } = useGLTF('/2.gltf')
  const modelRef = useRef<THREE.Group>(null)
  
  useEffect(() => {
    if (modelRef.current) {
      const box = new THREE.Box3().setFromObject(modelRef.current)
      const center = box.getCenter(new THREE.Vector3())
      
      modelRef.current.position.x = -center.x
      modelRef.current.position.y = -center.y
      modelRef.current.position.z = -center.z
    }
  }, [scene])
  
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111' }}>
      <Canvas 
        camera={{ 
          position: [5000, 0, 0],
          near: 0.1,
          far: 20000
        }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[4000, 4000, 4000]} intensity={1} />
        <pointLight position={[0, 3000, 0]} intensity={0.5} />
        
        <primitive ref={modelRef} object={scene} />
        
        <OrbitControls 
          minDistance={100}
          maxDistance={200000}
          enableZoom={true}
          enablePan={true}
          enableRotate={true}
        />
      </Canvas>
    </div>
  )
}

export default App