import { api } from './api';

export interface Icd11Match {
  code: string;
  title: string;
}

export const searchIcd11 = (q: string) => api.get<Icd11Match[]>('/icd11/search', { params: { q } }).then((r) => r.data);
