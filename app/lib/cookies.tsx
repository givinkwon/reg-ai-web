import Cookies from 'js-cookie';

export const setJobTypeCookie = (jobType: string) => {
  Cookies.set('selectedJobType', jobType, { expires: 30 });
};

export const getJobTypeCookie = (): string | undefined => {
  return Cookies.get('selectedJobType');
};