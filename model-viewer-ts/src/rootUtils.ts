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

export async function loadRootGeometry(
  filePath: string,
  onProgress?: (msg: string) => void,
  hiddenPaths: (string | RegExp)[] = [],
  maxLevel: number = 20,
  fullPath: boolean = false
): Promise<THREE.Group> {
  onProgress?.('Opening ROOT file...');
  const file = await openFile(filePath);

  onProgress?.('Searching for TGeoManager...');
  const geoManager = await findGeoManager(file);
  if (!geoManager) throw new Error('TGeoManager not found');

  const masterNode = geoManager.fMasterVolume || geoManager.fVolume;
  const topNode = masterNode?.fNodes?.arr?.[0];
  
  if (!topNode) throw new Error('No top volume found');

  onProgress?.('Cleaning up geometry...');
  cleanupGeometry(topNode, hiddenPaths, maxLevel, fullPath);

  const nFaces = 24;
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