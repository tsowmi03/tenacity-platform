import DesignPage from "@modules/design/DesignPage";
import { getDesignStaticProps } from "@modules/design/staticHtml";
import type { DesignStaticProps } from "@modules/design/staticHtml";

export const getStaticProps = () => {
  return {
    props: getDesignStaticProps("home.html"),
  };
};

export default function Home(props: DesignStaticProps) {
  return <DesignPage {...props} page="home" />;
}
