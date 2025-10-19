import Link from "next/link";
import { PAGES } from "@lib/constants";
import clsx from "clsx";
import { usePathname } from "next/navigation";
// import Facebook from "@modules/common/icons/facebook";
// import Whatsapp from "@modules/common/icons/Whatsapp";
// import Instagram from "@modules/common/icons/instagram";
// import Linkedin from "@modules/common/icons/linkedin";
// import Email from "@modules/common/icons/email";
import Image from "next/image";

const FooterNav = () => {
  const pathname = usePathname();

  return (
    <div className=" flex flex-col px-0 pt-12 pb-8 content-container gap-y-8 sm:px-16 bg-primary-lighter">
      <div className="flex flex-col items-start justify-between px-6 gap-y-6 md:flex-row md:px-0 ">
        <div className="flex w-full gap-4 justify-evenly small:justify-normal  small:w-1/2">
          <div className="w-[100%] flex justify-center flex-col small:flex-row small:justify-start">
            <div className="uppercase text-xl-semi self-center">
              <Link
                href="/"
                aria-label="Go to homepage"
                className="uppercase text-xl-semi self-center mb-10"
              >
                <Image
                  src="/logo.png"
                  alt="Tenacity Tutoring Logo"
                  width={180}
                  height={100}
                />
              </Link>
              {/* <div className="flex justify-between mt-2 ">
                <Link
                  href="https://www.facebook.com/Tenacity"
                  aria-label="Go to facebook"
                >
                  <Facebook
                    size={32}
                    className="transition-all duration-200 ease-out cursor-pointer text-navy opacity-90 hover:scale-125"
                  />
                </Link>
                <Link
                  href="https://wa.me/+201005100628?text=I%20would%20like%20a%20demo%20"
                  aria-label="Go to Whatsapp"
                >
                  <Whatsapp
                    size={32}
                    className="transition-all duration-200 ease-out cursor-pointer text-navy opacity-90 hover:scale-125"
                  />{" "}
                </Link>
                <Link
                  href="https://www.instagram.com/Tenacity/"
                  aria-label="Go to instagram"
                >
                  <Instagram
                    size={32}
                    className="transition-all duration-200 ease-out cursor-pointer text-navy opacity-90 hover:scale-125"
                  />
                </Link>
                <Link
                  href="https://www.linkedin.com/company/Tenacity/posts/?feedView=all"
                  aria-label="Go to linkedin"
                >
                  <Linkedin
                    size={32}
                    className="transition-all duration-200 ease-out cursor-pointer text-navy opacity-90 hover:scale-125"
                  />{" "}
                </Link>
                <Link
                  href="mailto:enquiries@tenacitytutoring.com?subject=Hello%Enquiry&body=I%20would%20like%"
                  aria-label="Go to Email"
                >
                  <Email
                    size={32}
                    className="transition-all duration-200 ease-out cursor-pointer text-navy opacity-90 hover:scale-125"
                  />
                </Link>
              </div> */}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 text-sm gap-x-10  my-5 md:my-0  small:w-1/2 small:pl-4">
          <div className="flex flex-col gap-y-2">
            <span className="font-semibold">Navigation </span>
            {PAGES.map((page, index) => {
              return (
                <Link
                  href={page.path}
                  key={index}
                  area-label={page.name}
                  className={clsx("hover:underline", {
                    "text-primary  font-bold": pathname === page.path,
                    "text-regular": pathname !== page.path,
                  })}
                >
                  {page.name}
                </Link>
              );
            })}

            <Link
              href="/T&Cs.pdf"
              target="_blank"
              rel="noopener noreferrer"
              area-label="Terms & Conditions"
              className={clsx("hover:underline", {
                "text-primary  font-bold": pathname === "/privacy-policy",
                "text-regular": pathname !== "/privacy-policy",
              })}
            >
              Terms & Conditions
            </Link>
          </div>
          <div className="flex flex-col gap-y-2 text-sm">
            <span className="font-semibold">Contact info</span>
            <ul className="grid grid-cols-1 gap-y-2">
              <li>
                <a
                  href="mailto:enquiries@tenacitytutoring.com"
                  target="_blank"
                  rel="noreferrer"
                  className="break-all"
                >
                  enquiries@tenacitytutoring.com
                </a>
              </li>

              <li>
                <a href="tel:0401455112" target="_blank" rel="noreferrer">
                  <b>AU:</b> 0401 455 112
                </a>
              </li>

              <li>
                <a
                  href="https://maps.app.goo.gl/pZQfSzQ3p9MebZUn6"
                  target="_blank"
                  rel="noreferrer"
                >
                  16 Broadarrow Road, Narwee, NSW 2209
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="flex flex-col-reverse justify-center px-4 pt-4 border-t border-gray-300 gap-y-4 xsmall:items-center xsmall:flex-row xsmall:justify-between md:px-0">
        <span className="text-gray-500 text-xsmall-regular">
          © Copyright 2025 Tenacity Tutoring
        </span>
        {/* <div className="text-gray-500 text-xsmall-regular">
          Registered company limited by guarantee with ABN
        </div> */}
      </div>
    </div>
  );
};

export default FooterNav;
