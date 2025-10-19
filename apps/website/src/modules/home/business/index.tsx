import EmblaCarousel from "@modules/common/components/embla-carousel";
import MenuManagement from "@modules/common/icons/menu-management";
import { Radio } from "@mui/material";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { IconProps } from "types/icon";

// Screen Types
enum ScreenType {
  Admin = "admin",
  Waiter = "waiter",
}

// Features for each screen
const features = {
  [ScreenType.Admin]: [
    {
      name: "Menu Management",
      description: "Easily customize and update your menu.",
      imageUrl: "/admin-menu-management.png",
    },
    {
      name: "Reviews",
      description:
        "Get visibility into your customers' feedback and send them offers.",
      imageUrl: "/admin-reviews.png",
    },
    {
      name: "Offer Calibration",
      description:
        "Configure and launch different types of offers in just a few clicks.",
      imageUrl: "/admin-offer-calibration.png",
    },
    {
      name: "Dashboard",
      description:
        "Access detailed insights into your sales and loyalty performance.",
      imageUrl: "/admin-dashboard.png",
    },
  ],
  [ScreenType.Waiter]: [
    {
      name: "Stock Management",
      description: "Keep track of inventory and reduce waste.",
      imageUrl: "/waiter-stock-management.png",
    },
    {
      name: "Operating Hours",
      description: "Set and manage operational schedules easily.",
      imageUrl: "/waiter-operating-hours.png",
    },
    {
      name: "Pager",
      description: "Streamline table requests and communication.",
      imageUrl: "/waiter-pager.png",
    },
    {
      name: "Pending Orders",
      description: "View and manage all pending customer orders.",
      imageUrl: "/waiter-pending-orders.png",
    },
  ],
};

// // ToggleSwitch Component
// function ToggleSwitch({
//   isChecked,
//   onToggle,
// }: {
//   isChecked: boolean;
//   onToggle: () => void;
// }) {
//   return (
//     <label className="relative inline-flex items-center cursor-pointer">
//       <input
//         type="checkbox"
//         checked={isChecked}
//         onChange={onToggle}
//         className="sr-only peer"
//       />
//       <div className="w-12 h-6 bg-primary-light border-white rounded-full peer peer-focus:ring-blue-300 peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border after:border-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
//     </label>
//   );
// }

// // FeatureCard Component
// // eslint-disable-next-line @typescript-eslint/no-unused-vars
// function FeatureCard2({
//   icon: Icon,
//   title,
//   description,
//   isChecked,
//   onToggle,
// }: {
//   icon: React.FC<IconProps>;
//   title: string;
//   description: string;
//   isChecked: boolean;
//   onToggle: () => void;
// }) {
//   return (
//     <div
//       className={clsx(
//         "bg-primary-lighter rounded-2xl h-1/2 flex flex-col place-items-center justify-center gap-1 lg:gap-2 font-semibold px-2",
//         {
//           "outline-navy outline ": isChecked,
//         }
//       )}
//     >
//       <Icon size={35} className="lg:scale-100 scale-75" />
//       <h3 className="text-sm lg:text-base font-normal">{title}</h3>
//       <p
//         className={`text-xs lg:text-[0.9vw] text-neutral font-normal transition-all duration-200 overflow-clip  ${
//           isChecked ? "h-8" : "h-0"
//         }`}
//       >
//         {description}
//       </p>
//       <ToggleSwitch isChecked={isChecked} onToggle={onToggle} />
//     </div>
//   );
// }

// FeatureCard Component
function FeatureCard({
  icon: Icon,
  title,
  description,
  isChecked,
  onToggle,
}: {
  icon: React.FC<IconProps>;
  title: string;
  description: string;
  isChecked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={clsx(
        "bg-primary-lighter rounded-2xl h-1/2 flex flex-col place-items-center justify-center gap-1 lg:gap-2 font-semibold px-2",
        {
          "outline-primary outline outline-2 ": isChecked,
        }
      )}
      onClick={onToggle}
    >
      <Icon size={35} className="lg:scale-100 scale-75" />
      <h3 className="text-sm lg:text-base font-normal">{title}</h3>
      <p
        className={`text-xs lg:text-[0.9vw] text-neutral font-normal transition-all duration-200 overflow-clip  ${
          isChecked ? "h-8" : "h-0"
        }`}
      >
        {description}
      </p>
      <label className="sr-only" htmlFor={"toggle" + title}>
        {"toggle" + title}
      </label>
      <Radio
        checked={isChecked}
        onClick={onToggle}
        id={"toggle" + title}
        className="!text-primary"
        sx={{
          padding: "0.2rem",
        }}
      ></Radio>
    </div>
  );
}

// Business Component
function Business() {
  // const [screen, setScreen] = useState<ScreenType>(ScreenType.Admin);
  const [selectedFeature, setSelectedFeature] = useState<string>(
    features[ScreenType.Admin][0].name
  );

  // Find selected feature index
  const selectedFeatureIndex = useMemo(() => {
    const index = features["admin"].findIndex(
      (feature) => feature.name === selectedFeature
    );

    return index;
  }, [selectedFeature]);

  return (
    <div className="flex flex-col w-full text-center justify-center text-navy justify-items-center items-center  px-4">
      <p className="text-sm lg:text-base border-[1px] border-primary px-2 py-0.5 rounded-md w-fit">
        For your Business
      </p>
      <h2 className="text-2xl lg:text-4xl font-semibold max-w-screen-xsmall mt-3">
        Be in control of your loyalty programs and orders with our <br />
        <span className="text-primary"> management app</span>
      </h2>

      {/* Tabs */}
      {/* <div className="flex my-4 lg:my-10 lg:text-xl bg-primary-lighter px-6 lg:px-8 py-2 lg:py-4 w-full lg:max-w-[43vw] justify-center rounded-2xl">
        <button
          className={clsx(
            "w-1/2 rounded-xl py-2 transition-all duration-200",
            screen === ScreenType.Admin ? "bg-primary text-white" : ""
          )}
          onClick={() => {
            setScreen(ScreenType.Admin);
            setSelectedFeature(features[ScreenType.Admin][0].name);
          }}
        >
          Prepit app
        </button>
        <button
          className={clsx(
            "w-1/2 rounded-xl py-2 transition-all duration-200",
            screen === ScreenType.Waiter ? "bg-primary text-white" : ""
          )}
          onClick={() => {
            setScreen(ScreenType.Waiter);
            setSelectedFeature(features[ScreenType.Waiter][0].name);
          }}
        >
          Waiter app
        </button>
      </div> */}

      {/* Feature Grid */}
      <div className="flex flex-col lg:flex-row gap-4 lg:h-[32vw] mt-10">
        {/* Left Column */}
        <div className="hidden lg:flex w-[15vw] gap-4 flex-col">
          {features["admin"].slice(0, 2).map((feature) => (
            <FeatureCard
              key={feature.name}
              icon={MenuManagement}
              title={feature.name}
              description={feature.description}
              isChecked={selectedFeature === feature.name}
              onToggle={() => setSelectedFeature(feature.name)}
            />
          ))}
        </div>

        {/* Center Column */}
        <div className="w-[calc(100vw-2rem)] h-[40vh] lg:h-auto lg:w-[43vw] bg-primary-lighter rounded-2xl flex items-center justify-center p-2 ">
          <div className="w-full h-full relative rounded-lg overflow-clip">
            <EmblaCarousel
              srcList={features["admin"].map((feature) => feature.imageUrl)}
              imageIndex={selectedFeatureIndex} // Dynamically select the image index
              disableManualSwitching
              disableAutoPlay
              width={2048}
              height={1468}
              layout="responsive"
              loading="lazy"
            />
          </div>
        </div>

        <div className="flex gap-4 min-h-[350px] h-[40vh] lg:h-auto">
          <div className="flex lg:hidden w-1/2 lg:w-[15vw] gap-4 flex-col">
            {features["admin"].slice(0, 2).map((feature) => (
              <FeatureCard
                key={feature.name}
                icon={MenuManagement}
                title={feature.name}
                description={feature.description}
                isChecked={selectedFeature === feature.name}
                onToggle={() => setSelectedFeature(feature.name)}
              />
            ))}
          </div>

          {/* Right Column */}
          <div className="lg:w-[15vw] w-1/2 gap-4 flex flex-col">
            {features["admin"].slice(2).map((feature) => (
              <FeatureCard
                key={feature.name}
                icon={MenuManagement}
                title={feature.name}
                description={feature.description}
                isChecked={selectedFeature === feature.name}
                onToggle={() => setSelectedFeature(feature.name)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Business;
