import axios from "axios";

export const api = axios.create({
  baseURL: "http://116.203.123.130:8000/",
});
