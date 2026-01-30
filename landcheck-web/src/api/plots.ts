import { api } from "./client";

export async function createPlot(coords: number[][]) {
  const res = await api.post("/plots", coords);
  return res.data;
}

export async function getFeatures(plotId: number) {
  const res = await api.get(`/plots/${plotId}/features`);
  return res.data;
}

export const surveyPreviewUrl = (id: number) =>
  `http://localhost:8000/plots/${id}/report/preview`;

export const surveyPdfUrl = (id: number) =>
  `http://localhost:8000/plots/${id}/report/pdf`;

export const dwgUrl = (id: number) =>
  `http://localhost:8000/plots/${id}/survey-plan/dwg`;

export const orthoPreviewUrl = (id: number) =>
  `http://localhost:8000/plots/${id}/orthophoto/preview`;

export const orthoPdfUrl = (id: number) =>
  `http://localhost:8000/plots/${id}/orthophoto/pdf`;
