const padMonth = (month: number) => `${month}`.padStart(2, "0");

export const getYearMonthFromDateValue = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const isoLikeMatch = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);

  if (isoLikeMatch?.[1] && isoLikeMatch?.[2]) {
    return `${isoLikeMatch[1]}-${isoLikeMatch[2]}`;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getUTCFullYear()}-${padMonth(parsed.getUTCMonth() + 1)}`;
};

export const getCaseYearMonth = (
  bookingDate: string | null | undefined,
  createdAt: string | null | undefined
) => {
  return getYearMonthFromDateValue(bookingDate) ?? getYearMonthFromDateValue(createdAt);
};

export const getYearFromYearMonth = (yearMonth: string | null | undefined) => {
  if (!yearMonth) {
    return null;
  }

  const [year] = yearMonth.split("-");
  return year && /^\d{4}$/.test(year) ? year : null;
};

export const getMonthFromYearMonth = (yearMonth: string | null | undefined) => {
  if (!yearMonth) {
    return null;
  }

  const [, month] = yearMonth.split("-");
  return month && /^\d{2}$/.test(month) ? month : null;
};