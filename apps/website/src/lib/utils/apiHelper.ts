import axios from "axios";

export const sendEmailForm = async (formData: {
  reason: string;
  name: string;
  email: string;
  phoneNumber: string;
  additionalInfo: string;
}) => {
  const response = await axios.post("/api/send-email", formData);
  return response.data;
};

export const sendNotification = async (details: string[]) => {
  const response = await axios.post("/api/send-notification", { details });
  return response.data;
};
