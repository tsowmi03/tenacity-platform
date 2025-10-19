import axios from "axios";

export const sendEmailForm = async (formData: {
  reason: string;
  name: string;
  email: string;
  phoneNumber: string;
  additionalInfo: string;
}) => {
  await axios.post("/api/send-email", formData);
};

export const sendNotification = async (details: string[]) => {
  await axios.post("/api/send-notification", { details });
};
