export const dateText = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const money = (value: number) => `LKR ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const errorText = (error: unknown) => {
  const e = error as { response?: { data?: { message?: string } } };
  return e?.response?.data?.message || 'Something went wrong. Please try again.';
};
