import { useMobileMenu } from "@lib/context/mobile-menu-context";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGES } from "@lib/constants";
import X from "@modules/common/icons/x";
import CurvyButton from "@modules/common/components/curvy-button";
import { useRouter } from "next/router";
import Calendar from "@modules/common/icons/calendar";
import Image from "next/image";

const MainMenu = () => {
  const pathname = usePathname();
  const { close } = useMobileMenu();
  const router = useRouter();

  return (
    <div className="flex flex-col flex-1">
      <div className="flex items-center justify-between w-full px-6 py-4 border-b border-gray-200">
        <div className="flex-1 basis-0"></div>
        <div>
          <h2 className="uppercase text-xl-semi">
            <Image
              src="/logo.png"
              alt="Tenacity Tutoring Logo"
              width={130}
              height={130}
            />{" "}
          </h2>
        </div>
        <div className="flex justify-end flex-1 basis-0">
          <button onClick={close}>
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex flex-col justify-between flex-1 p-6 space-y-6">
        <div className="flex flex-col flex-1 text-gray-900 text-large-regular">
          <ul className="flex flex-col gap-y-2 ">
            {PAGES.filter((p) => p.path !== "/donate").map((page, index) => {
              return (
                <li
                  className={clsx("p-4 bg-gray-50", {
                    "text-large-semi": pathname === page.path,
                    "text-large-regular": pathname !== page.path,
                  })}
                  key={index}
                >
                  <Link href={page.path} area-label={page.name}>
                    <button
                      className="flex items-center justify-between w-full"
                      onClick={close}
                    >
                      <span className="sr-only">Go to {page.name}</span>
                      <span>{page.name}</span>
                      {/* <ChevronDown className="-rotate-90" /> */}
                    </button>
                  </Link>
                </li>
              );
            })}

            <hr className="m-4"></hr>
            <span className="text-gray-700  text-base-semi text-center pb-3">
              Want to get <b>in Touch?</b>
            </span>

            <CurvyButton
              onClick={() => {
                router.push("/contact");
                close();
              }}
              className="!bg-primary-lighter !text-navy !px-6 !py-2 rounded-full"
            >
              <Calendar size={15} />
              Get in touch{" "}
            </CurvyButton>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default MainMenu;
