import Container from "@modules/mobile-menu/components/container";
import MainMenu from "@modules/mobile-menu/components/main-menu";

const MobileMenu = () => {
  return (
    <Container>
      <div className="flex flex-col flex-1">
        <MainMenu />
      </div>
    </Container>
  );
};

export default MobileMenu;
