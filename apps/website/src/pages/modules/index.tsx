export const getServerSideProps = () => {
  return {
    redirect: {
      destination: "/programs",
      permanent: true,
    },
  };
};

export const getSubjectSvg = (subject?: string) => {
  void subject;
  return null;
};

export default function ModulesRedirect() {
  return null;
}
