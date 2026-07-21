import {
  Dialog,
  Transition,
  TransitionChild,
  DialogBackdrop,
} from "@headlessui/react";
import { useMobileMenu } from "@lib/context/mobile-menu-context";
import { Fragment } from "react";

type ContainerProps = {
  children: React.ReactNode;
};

const Container = ({ children }: ContainerProps) => {
  const { state, close } = useMobileMenu();
  return (
    <Transition show={state} as={Fragment}>
      <Dialog as="div" className="fixed inset-0 flex z-50" onClose={close}>
        <TransitionChild
          as={Fragment}
          enter="ease-in-out duration-500"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in-out duration-500"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <DialogBackdrop className="absolute inset-0 bg-gray-700 bg-opacity-75 transition-opacity backdrop-blur-sm" />
        </TransitionChild>

        <TransitionChild
          as={Fragment}
          enter="transition ease-in-out duration-500 transform"
          enterFrom="-translate-x-full"
          enterTo="translate-x-0"
          leave="transition ease-in-out duration-500 transform"
          leaveFrom="translate-x-0"
          leaveTo="-translate-x-full"
        >
          <div className="absolute inset-0 overflow-hidden trans">
            <div className="pointer-events-none fixed inset-y-0 right-left flex max-w-full">
              <div className="relative w-screen pointer-events-auto bg-neutral-light text-gray-900 flex flex-col overflow-y-auto">
                {children}
              </div>
            </div>
          </div>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
};

export default Container;
