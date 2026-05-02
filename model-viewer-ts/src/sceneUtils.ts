import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { useState, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';

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

export function cleanupGeometry(
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

export function prepareForExport(group: THREE.Group): THREE.Group {
  const clone = group.clone(true) as THREE.Group;
  clone.updateWorldMatrix(true, true);
  const allMeshes: any[] = [];
  clone.traverse((obj: any) => {
    if (obj.isMesh === true || obj.type === 'Mesh') {
      if (obj.geometry) allMeshes.push(obj);
    }
  });
  const exportGroup = new THREE.Group();
  exportGroup.name = 'Scene';
  allMeshes.forEach((mesh, index) => {
    const newGeo = mesh.geometry.clone();
    const newMesh = new THREE.Mesh(newGeo, mesh.material);
    newMesh.geometry.applyMatrix4(mesh.matrixWorld);
    newMesh.position.set(0, 0, 0);
    newMesh.quaternion.identity();
    newMesh.scale.set(1, 1, 1);
    newMesh.updateMatrix();
    newMesh.updateMatrixWorld();
    newMesh.name = mesh.name || `Mesh_${index}`;
    exportGroup.add(newMesh);
  });
  return exportGroup;
}

