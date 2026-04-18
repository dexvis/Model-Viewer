import { openFile } from 'jsroot';
import { build } from 'jsroot/geom';
import * as THREE from 'three';

async function findGeoManager(file: any): Promise<any> {
  if (!file || !file.fKeys) return null;
  for (const key of file.fKeys) {
    if (key.fClassName === "TGeoManager") {
      const obj = await file.readObject(key.fName);
      if (obj && obj._typename === "TGeoManager") return obj;
    }
  }
  return null;
}

export async function loadRootGeometry(filePath: string, onProgress?: (msg: string) => void): Promise<THREE.Group> {
  onProgress?.('Opening ROOT file...');
  const file = await openFile(filePath);
  onProgress?.('Searching for TGeoManager...');
  const rootGeometry = await findGeoManager(file);
  if (!rootGeometry) throw new Error('TGeoManager not found');
  onProgress?.('Building 3D geometry...');
  const geometry = await build(rootGeometry, {
    numfaces: 5000000000,
    numnodes: 5000000000,
    instancing: -1,
    dflt_colors: false,
    vislevel: 200,
    doubleside: true,
    transparency: false
  });
  if (!geometry?.children?.length) throw new Error('Empty geometry');
  return geometry;
}