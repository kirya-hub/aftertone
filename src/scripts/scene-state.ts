export type SourceId = 'air' | 'voice' | 'signal';
export interface Source { id: SourceId; number: string; name: string; description: string; x: number; y: number; }
export interface Scene { selected: SourceId; sources: Source[]; }
export const MIN_POSITION = 10;
export const MAX_POSITION = 90;
const initialSources: readonly Source[] = [
  { id: 'air', number: '01', name: 'Atmosphere', description: 'A wide environmental bed. Explore its position relative to the listener and the other sources.', x: 29, y: 36 },
  { id: 'voice', number: '02', name: 'Voice', description: 'A focal point for the scene. Try a different position to give the conversation a precise reference.', x: 71, y: 42 },
  { id: 'signal', number: '03', name: 'Signal', description: 'A distinct point of attention. Place it in the field and see its direction from the listener.', x: 58, y: 70 },
];
export function createScene(): Scene { return { selected: 'air', sources: initialSources.map(source => ({ ...source })) }; }
export function selectSource(scene: Scene, id: string): Scene {
  return scene.sources.some(source => source.id === id) ? { ...scene, selected: id as SourceId } : scene;
}
export function selectedSource(scene: Scene): Source { return scene.sources.find(source => source.id === scene.selected)!; }
export function setPosition(scene: Scene, id: SourceId, x: number, y: number): Scene {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return scene;
  const clamp = (value: number) => Math.round(Math.min(MAX_POSITION, Math.max(MIN_POSITION, value)));
  return { ...scene, sources: scene.sources.map(source => source.id === id ? { ...source, x: clamp(x), y: clamp(y) } : source) };
}
export function positionLabel(x: number, y: number): string {
  const horizontal = x < 45 ? 'left' : x > 55 ? 'right' : 'center';
  const depth = y < 45 ? 'Front' : y > 55 ? 'Back' : 'Alongside';
  if (horizontal === 'center' && depth === 'Alongside') return 'At the listener';
  return `${depth} ${horizontal}`;
}
export function relativeCoordinate(value: number): number { return (value - 50) * 2; }
export function positionContext(x: number, y: number): string {
  const direction = positionLabel(x, y);
  return direction === 'At the listener' ? 'At the center of the field, sharing the listening position.' : `${direction} of the listening position. Coordinates describe placement, not acoustic measurements.`;
}
