export type TbmSignData = {
  title: string;
  company: string;
  siteName?: string;
  dateISO: string;
  workSummary: string;
  hazardSummary: string;
  complianceSummary: string;
  attendeeName?: string;
  alreadySigned?: boolean;
  expiresAt?: string;
};
