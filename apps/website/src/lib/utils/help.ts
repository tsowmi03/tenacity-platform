import { AWS_S3_BASE_URL } from "@lib/constants";

export const getS3Path = (path: string) => {
  return AWS_S3_BASE_URL + path;
};
