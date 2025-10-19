import EmblaCarousel from "@modules/common/components/embla-carousel";
import VerticalLinearStepper from "./Stepper";
import CustomizationIcon from "@modules/common/icons/customization";
import { useIsElementCentered } from "@lib/hooks/use-in-screen-center";
import { useEffect, useRef, useState } from "react";

export enum StepsEnum {
  WelcomeOffer = "Welcome Offer",
  CheckTheMenu = "Check the menu",
  AddYourItems = "Add your items",
  PaymentOptions = "Payment options",
  Checkout = "Checkout",
  Success = "Success! (+points)",
  Reviews = "Reviews",
}

export enum Colors {
  Color1 = "#AE3868",
  Color2 = "#265940",
  Color3 = "#4A085A",
}

const colorName = {
  [Colors.Color1]: "Pink",
  [Colors.Color2]: "Green",
  [Colors.Color3]: "Purple",
};

export const steps = [
  StepsEnum.WelcomeOffer,
  StepsEnum.CheckTheMenu,
  StepsEnum.AddYourItems,
  StepsEnum.PaymentOptions,
  StepsEnum.Checkout,
  StepsEnum.Success,
  StepsEnum.Reviews,
];

const getImageFromStepAndColor = (step: StepsEnum, colorCode: Colors) => {
  const color = colorName[colorCode];
  const gifName = (suffix: string) => `/gifs/${color}-${suffix}.gif`;

  switch (step) {
    case StepsEnum.WelcomeOffer:
      return gifs.indexOf(gifName("WO"));
    case StepsEnum.CheckTheMenu:
      return gifs.indexOf(gifName("menu"));
    case StepsEnum.AddYourItems:
      return gifs.indexOf(gifName("items"));
    case StepsEnum.PaymentOptions:
      return gifs.indexOf(gifName("Pay"));
    case StepsEnum.Checkout:
      return gifs.indexOf(gifName("Cart"));
    case StepsEnum.Success:
      return gifs.indexOf(gifName("success"));
    case StepsEnum.Reviews:
      return gifs.indexOf(gifName("reviews"));
    default:
      return -1;
  }
};

const gifs = [
  "/gifs/Pink-WO.gif",
  "/gifs/Pink-menu.gif",
  "/gifs/Pink-items.gif",
  "/gifs/Pink-Pay.gif",
  "/gifs/Pink-Cart.gif",
  "/gifs/Pink-success.gif",
  "/gifs/Pink-reviews.gif",
  "/gifs/Green-WO.gif",
  "/gifs/Green-menu.gif",
  "/gifs/Green-items.gif",
  "/gifs/Green-Pay.gif",
  "/gifs/Green-Cart.gif",
  "/gifs/Green-success.gif",
  "/gifs/Green-reviews.gif",
  "/gifs/Purple-WO.gif",
  "/gifs/Purple-menu.gif",
  "/gifs/Purple-items.gif",
  "/gifs/Purple-Pay.gif",
  "/gifs/Purple-Cart.gif",
  "/gifs/Purple-success.gif",
  "/gifs/Purple-reviews.gif",
];

function Customization() {
  const elementRef = useRef<HTMLDivElement>(null);
  const isCentered = useIsElementCentered(elementRef);
  const [step, setStep] = useState(0);
  const [color, setColor] = useState(Colors.Color1);

  useEffect(() => {
    if (!elementRef.current) {
      console.error("The ref is null. Make sure it's attached to an element.");
      return;
    }
  }, [elementRef]);

  return (
    <div
      ref={elementRef}
      className={`flex w-screen px-4 lg:px-[4.5rem]  py-10 h-0 min-h-0 flex-col lg:flex-row gap-10 border-primary border-2 rounded-2xl lg:rounded-[70px] transition-all duration-[2s]  justify-center ${
        isCentered
          ? "py-4 lg:py-32 !min-h-[96vh] h-[125vh] lg:h-[96vh] !lg:max-h-[96vh] "
          : ""
      } overflow-clip`}
      id="products"
    >
      <div className="items-center lg:items-start w-full lg:w-1/2 h-auto  text-navy content-center lg:h-auto lg:mr-10 flex flex-col justify-between gap-10">
        <div className="flex flex-col justify-items-center items-center justify-center lg:justify-start lg:items-start ">
          <p className="text-sm lg:text-base border-[1px] border-primary  text-navy px-2 py-0.5 rounded-md w-fit mb-6">
            For your customers
          </p>
          <h2 className=" lg:text-[4vw] lg:text-6xl text-3xl lg:text-left text-center">
            Set up a <span className="text-primary">customized</span> <br />
            online ordering <br />
            webapp in no time!
          </h2>
        </div>

        <div className="max-w-[80%] lg:h-[200px] lg:w-[300px] bg-primary-lighter text-navy rounded-xl px-4 py-6 flex gap-4 mt-8">
          <CustomizationIcon size={70} />
          <div className="flex flex-col justify-between gap-2">
            <h3 className="text-lg font-semibold leading-5">
              Our solution is fully white-labeled
            </h3>
            <p className=" text-xs">
              Customize your interface’s look and feel according to your brand.
            </p>
            <div className="flex gap-3">
              {Object.values(Colors).map((color) => {
                return (
                  <div
                    key={color}
                    className={`border-2 border-navy rounded-full cursor-pointer transition-all duration-500 hover:scale-[115%] `}
                    onClick={() => setColor(color)}
                  >
                    <div
                      className={`border-2 h-8 w-8 rounded-full`}
                      style={{ backgroundColor: color }}
                    ></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="w-full lg:w-1/2 relative lg:h-auto flex">
        <div
          className="lg:h-[64.4vh] lg:min-w-[30.8vh]  rounded-2xl border-navy border-8 overflow-clip
        min-w-[50vw] h-[103.5vw] self-center
        "
        >
          <EmblaCarousel
            srcList={gifs}
            objectFit="scale-down"
            unoptimized={true}
            imageIndex={getImageFromStepAndColor(steps[step], color)}
            disableAutoPlay
            disableManualSwitching
            loading="lazy"
          />
        </div>
        <div className="h-full w-[300px]  rounded-xl pl-6 lg:pl-10 ">
          <VerticalLinearStepper step={step} setStep={setStep} />
        </div>
      </div>
    </div>
  );
}

export default Customization;
