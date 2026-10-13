import { z } from "zod";

export const PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
] as const;
export const customerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name."),
  phone: z
    .string()
    .trim()
    .refine(
      (value) =>
        /^(?:0\d{9}|\+[1-9]\d{7,14}|27\d{9})$/.test(
          value.replace(/[\s()-]/g, ""),
        ),
      "Enter a phone number, e.g. 082 123 4567, or an international number with +country code.",
    ),
  email: z.string().trim().email("Enter a valid email address."),
  streetAddress: z.string().trim().min(3, "Enter your street address."),
  suburb: z.string().trim(),
  city: z.string().trim().min(2, "Enter your city or town."),
  province: z.enum(PROVINCES, {
    errorMap: () => ({ message: "Choose your province." }),
  }),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Enter a four-digit South African postal code."),
  notes: z.string().trim().max(600),
});
export type CustomerDetails = z.infer<typeof customerSchema>;
export const EMPTY_CUSTOMER = {
  fullName: "",
  phone: "",
  email: "",
  streetAddress: "",
  suburb: "",
  city: "",
  province: "",
  postalCode: "",
  notes: "",
};

