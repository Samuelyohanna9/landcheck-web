export type GeoreferenceControlPoint = {
  id: string;
  label: string;
  image_x: number;
  image_y: number;
  lng: number;
  lat: number;
  error_m?: number;
};

export type GeoreferenceTransform = {
  target_coordinate_system: string;
  target_epsg: number;
  coefficients: {
    x: [number, number, number];
    y: [number, number, number];
  };
  rms_error_m: number;
  condition_number: number;
  quality: "strong" | "usable" | "weak";
  points_used: number;
  residuals: GeoreferenceControlPoint[];
  overlay_corners: [number, number][];
};

export type GeoreferenceOverlay = {
  corners: [number, number][];
};

export type GeoreferenceFeature = {
  id: string;
  label: string;
  feature_type: "point" | "line" | "polygon";
  is_primary?: boolean;
  pixels: { x: number; y: number }[];
  target_coordinates: [number, number][];
  wgs84_coordinates: [number, number][];
};

export type GeoreferenceSession = {
  id: string;
  title_text: string;
  status: string;
  target_coordinate_system: string;
  target_epsg: number;
  source_file_name: string;
  source_content_type: string;
  source_width: number;
  source_height: number;
  ground_control_points: GeoreferenceControlPoint[];
  transform: GeoreferenceTransform | null;
  overlay: GeoreferenceOverlay | null;
  features: GeoreferenceFeature[];
  raster_url: string;
  delete_after_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  finalized_at: string | null;
};
