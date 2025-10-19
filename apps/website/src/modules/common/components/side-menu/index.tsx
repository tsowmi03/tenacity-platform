import clsx from "clsx";
import { useEffect, useState } from "react";

interface MenuItem {
  text: string;
  sectionId: string;
}

interface SideMenuProps {
  menuItems: MenuItem[];
  title: string;
}

const SideMenu: React.FC<SideMenuProps> = ({ menuItems, title }) => {
  const [activeSection, setActiveSection] = useState("");

  function scrollToElementWithMargin(element: HTMLElement, margin: number) {
    const elementPosition =
      element.getBoundingClientRect().top + window.pageYOffset;
    const offsetPosition = elementPosition - margin;

    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth",
    });
  }

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    const navigation = document.getElementById("nav");

    if (element && navigation) {
      // element.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(id);
      scrollToElementWithMargin(element, navigation?.clientHeight + 50);
    }
  };

  useEffect(() => {
    function follow() {
      const reveals = document.querySelectorAll(".follow");

      for (let i = 0; i < reveals.length; i++) {
        const windowHeight = window.innerHeight;
        const elementTop = reveals[i].getBoundingClientRect().top;
        const elementVisible = 100;

        if (elementTop < windowHeight - elementVisible) {
          reveals[i].classList.add("active");
        } else {
          reveals[i].classList.remove("active");
        }
      }
    }

    window.addEventListener("scroll", follow);
  });

  useEffect(() => {
    function inView() {
      let currentActiveSection = ""; // Track the current active section
      for (const menuItem of menuItems) {
        const item = document.getElementById(menuItem.sectionId);
        if (item) {
          const windowHeight = window.innerHeight;
          const elementTop = item.getBoundingClientRect().top;
          const elementBottom = item.getBoundingClientRect().bottom;

          const elementVisible = 100;

          // Check if the section is within the viewport
          const isTopVisible =
            elementTop < windowHeight && elementTop > -elementVisible;

          const isBottomVisible =
            elementBottom > elementVisible && elementBottom < windowHeight;

          if (isTopVisible || isBottomVisible) {
            currentActiveSection = menuItem.sectionId;
            break;
            // Optional: Log for debugging

            // Break the loop once the first in-view section is found
            // Remove 'break' if you want to prioritize the last section in view
          }
        }
      }

      // Set the active section only if it has changed
      // This prevents unnecessary re-renders or state updates
      if (currentActiveSection && currentActiveSection !== activeSection) {
        setActiveSection(currentActiveSection);
        scrollMenuItemToView("menuitem-" + currentActiveSection);
      }
    }

    // Register the event listener
    window.addEventListener("scroll", inView);

    // Cleanup function to remove the event listener
    return () => {
      window.removeEventListener("scroll", inView);
    };
  }, [menuItems, activeSection]); // Ensure the effect runs when 'menuItems' or 'activeSection' changes

  const scrollMenuItemToView = (id: string) => {
    const item = document.getElementById(id);
    const menu = document.getElementById("menu-scroll");

    if (item && menu) {
      const elementPosition = item.getBoundingClientRect().left;

      const offsetPosition = elementPosition;

      menu.scrollTo({
        left: offsetPosition - 30,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="bg-neutral-light w-full px-8 bg-transparent text-base-semi flex  p-4 min-w-[25%] justify-end follow h-min md:w-40 md:px-0 z-20 -mt-24">
      <div
        id="menu-scroll"
        className="w-full flex md:flex-col md:items-left md:w-1/2  overflow-auto no-scrollbar"
      >
        <div className="text-primary text-xl-semi hidden md:block">{title}</div>
        {menuItems.map((menuItem, index) => {
          const isCurrentTab = activeSection === menuItem.sectionId;
          return (
            <div
              id={"menuitem-" + menuItem.sectionId}
              key={"menuitem-" + index}
              onClick={() => scrollToSection(menuItem.sectionId)}
              className={clsx(
                "min-w-fit px-2 cursor-pointer relative leading-[3rem] border-b-[1px] text-gray-400  hover:text-gray-800 mt-1 md:w-full md:px-0",
                {
                  "text-gray-800": isCurrentTab,
                  " border-b-0": index === menuItems.length - 1,
                }
              )}
            >
              <span> {menuItem.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SideMenu;
