export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
}

export interface BusinessProfile {
  companyName: string;
  description: string;
  address: string;
  hours: string;
  phoneWhatsApp: string;
  email: string;
  socialLinks: SocialLinks;
  locationMapLink?: string;
  logoUrl?: string;
  localPhotos: string[];
}
