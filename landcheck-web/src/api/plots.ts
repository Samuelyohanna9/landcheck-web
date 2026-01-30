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
  `http://116.203.123.130:8000//plots/${id}/report/preview`;

export const surveyPdfUrl = (id: number) =>
  `http://116.203.123.130:8000//plots/${id}/report/pdf`;

export const dwgUrl = (id: number) =>
  `http://116.203.123.130:8000//${id}/survey-plan/dwg`;

export const orthoPreviewUrl = (id: number) =>
  `http://116.203.123.130:8000//${id}/orthophoto/preview`;

export const orthoPdfUrl = (id: number) =>
  `http://116.203.123.130:8000//${id}/orthophoto/pdf`;