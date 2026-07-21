"use client";

import useCurrentWidth from "../hooks/use-current-width";
import useDebounce from "../hooks/use-debounce";
import useToggleState from "../hooks/use-toggle-state";
import { createContext, useContext, useEffect } from "react";

interface MobileMenuContext {
  state: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const MobileMenuContext = createContext<MobileMenuContext | null>(null);

export const MobileMenuProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { state, close, open, toggle } = useToggleState();

  const windowWidth = useCurrentWidth();

  const debouncedWith = useDebounce(windowWidth, 200);

  useEffect(() => {
    if (state && debouncedWith >= 1024) {
      close();
    }
  }, [close, debouncedWith, state]);

  useEffect(() => {}, [debouncedWith]);

  return (
    <MobileMenuContext.Provider
      value={{
        state,
        close,
        open,
        toggle,
      }}
    >
      {children}
    </MobileMenuContext.Provider>
  );
};

export const useMobileMenu = () => {
  const context = useContext(MobileMenuContext);

  if (context === null) {
    throw new Error(
      "useCartDropdown must be used within a CartDropdownProvider"
    );
  }

  return context;
};
