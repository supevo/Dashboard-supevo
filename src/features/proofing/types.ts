/** A single freehand stroke: normalised points (0..1) over the image box. */
export type Stroke = { x: number; y: number }[];

export interface ImageAnnotation {
  id: string;
  strokes: Stroke[];
  comment: string | null;
  status: 'open' | 'done';
  authorName: string;
  createdBy: string | null;
  createdAt: string;
}
