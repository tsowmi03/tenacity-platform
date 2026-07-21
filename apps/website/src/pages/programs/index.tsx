import DesignPage from "@modules/design/DesignPage";
import { getDesignStaticProps } from "@modules/design/staticHtml";
import type { DesignStaticProps } from "@modules/design/staticHtml";

export const getStaticProps = () => {
  return {
    props: getDesignStaticProps("programs.html"),
  };
};

export default function Programs(props: DesignStaticProps) {
  return <DesignPage {...props} page="programs" />;
}
