"use client";

import { PAGES } from "@lib/constants";
import { useMobileMenu } from "@lib/context/mobile-menu-context";
import CurvyButton from "@modules/common/components/curvy-button";
import Hamburger from "@modules/common/components/hamburger";
import MobileMenu from "@modules/mobile-menu";
import clsx from "clsx";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

const Nav = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isRegisterPage = pathname === "/register";
  //useEffect that detects if window is scrolled > 5px on the Y axis
  useEffect(() => {
    const detectScrollY = () => {
      if (window.scrollY > 5) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener("scroll", detectScrollY);

    return () => {
      window.removeEventListener("scroll", detectScrollY);
    };
  }, []);
  const { toggle } = useMobileMenu();

  return (
    <div
      className="fixed top-0 inset-x-0 z-50 group "
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchEnd={() => setIsHovered(!isHovered)}
    >
      <header
        className={clsx(
          "relative h-16 px-8 mx-auto transition-colors bg-transparent border-b border-transparent duration-200 group-hover:bg-white group-hover:border-gray-200",
          {
            "!bg-white !border-primary-lighter": isScrolled,
          }
        )}
      >
        <nav
          className={clsx(
            "text-neutral-light flex items-center justify-between w-full h-full text-small-semi transition-colors duration-200",
            {
              "text-primary-dark group-hover:text-primary-dark":
                isScrolled || isHovered,
            }
          )}
        >
          <div className="flex items-center h-full">
            <Link href="/" className="uppercase text-xl-semi">
              {isScrolled || isHovered ? (
                <Image
                  src="/Tenacity Vertical  Logo Png.png"
                  loading="eager"
                  priority={true}
                  quality={90}
                  alt=""
                  draggable="false"
                  width={130}
                  height={50}
                />
              ) : (
                <Image
                  src="/Tenacity Vertical  Logo White Png.png"
                  loading="eager"
                  priority={true}
                  quality={90}
                  alt=""
                  draggable="false"
                  width={130}
                  height={50}
                  sizes="100vw"
                />
              )}
            </Link>
          </div>
          <div className="flex items-center justify-end flex-1 h-full gap-x-6 basis-0">
            <div className="items-center hidden h-full small:flex gap-x-6">
              {PAGES.map((page, index) => {
                return (
                  page.name !== "Register" && (
                    <Link
                      href={page.path}
                      key={index}
                      className={clsx("hover:underline", {
                        " font-bold":
                          pathname.split("/")[1] === page.path.split("/")[1],
                        "text-regular":
                          pathname.split("/")[1] !== page.path.split("/")[1],
                        "text-navy-dark ":
                          isScrolled || isHovered || isRegisterPage,
                      })}
                    >
                      {page.name}
                    </Link>
                  )
                );
              })}
            </div>{" "}
            <div className="hidden small:flex">
              <CurvyButton
                onClick={() => {
                  router.push("/register");
                }}
                className={clsx("text-neutral-light !px-6 !py-2 rounded-full", {
                  "!bg-neutral-light !text-navy-dark": !(
                    isScrolled ||
                    isHovered ||
                    isRegisterPage
                  ),
                })}
              >
                Register now!
              </CurvyButton>
            </div>
          </div>
          <div className="flex items-center flex-1 h-full basis-0 justify-end md:hidden">
            <div
              className={clsx("block small:hidden text-navy ", {
                "text-neutral-light": !isScrolled,
                "md:text-neutral-light": !isHovered,
              })}
            >
              <Hamburger setOpen={toggle} />
            </div>
          </div>
        </nav>
        <MobileMenu />
      </header>
    </div>
  );
};

export default Nav;
