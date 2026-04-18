"use client";

import { useEffect, useState } from "react";
import { getBusinessProfile } from "@/supabase/db";

export default function NavbarLogoClient() {
  const [logoSrc, setLogoSrc] = useState("/logo.svg");

  useEffect(() => {
    getBusinessProfile()
      .then((profile) => {
        if (profile?.logoUrl) setLogoSrc(profile.logoUrl);
      })
      .catch(() => {});
  }, []);

  return (
    <img
      src={logoSrc}
      alt="Sistetecni"
      className="h-8 w-8 rounded-lg object-contain"
    />
  );
}
