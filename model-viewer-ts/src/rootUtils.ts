import { openFile, geoCfg } from 'jsroot';
import { build } from 'jsroot/geom';
import * as THREE from 'three';

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

/**
 * Постобработка Three.js группы: удаление служебных узлов и очистка userData
 */
function sanitizeThreeGroup(group: THREE.Group) {
  const toRemove: THREE.Object3D[] = [];
  group.traverse((obj: any) => {
    // Удаляем все возможные ключи, связанные с pivot
    if (obj.userData) {
      delete obj.userData.gltfPivot;
      delete obj.userData.gltfExtensions;
      delete obj.userData.pivot;
      delete obj.userData.originalRotation;
      delete obj.userData.originalPosition;
    }
    // Помечаем для удаления объекты без имени или содержащие 'pivot'
    if (!obj.name || obj.name === '' || obj.name.toLowerCase().includes('pivot')) {
      toRemove.push(obj);
    }
  });
  // Удаляем помеченные объекты
  toRemove.forEach(obj => {
    if (obj.parent) obj.parent.remove(obj);
  });
  // Принудительно обновляем матрицы
  group.updateWorldMatrix(true, true);
}

export async function loadRootGeometry(
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
    transp: false
  });

  if (!group?.children?.length) throw new Error('Empty geometry');

  onProgress?.('Sanitizing Three.js group...');
  sanitizeThreeGroup(group);

  return group;
}