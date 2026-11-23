import axios from "axios";

export const sendEmailForm = async (formData: {
  reason: string;
  name: string;
  email: string;
  phoneNumber: string;
  additionalInfo: string;
  website: string;
  turnstileToken: string;
}) => {
  const response = await axios.post("/api/send-email", formData);
  return response.data;
};

export const submitRegistration = async (
  enrolment: unknown,
  turnstileToken: string
) => {
  const response = await axios.post("/api/register", {
    enrolment,
    turnstileToken,
  });
  return response.data;
};
