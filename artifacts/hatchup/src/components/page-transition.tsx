import { ReactNode } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";

export function PageTransition({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return (
    <motion.div
      key={location}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="will-change-transform"
    >
      {children}
    </motion.div>
  );
}
