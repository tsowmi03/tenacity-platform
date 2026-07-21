import React from "react";
import Icon from "./Icon";

export default function Button({
  children,
  variant = "secondary",
  size,
  icon,
  iconRight,
  loading = false,
  className = "",
  type = "button",
  ...rest
}) {
  const classes = ["btn", `btn-${variant}`, size ? `btn-${size}` : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} disabled={loading || rest.disabled} type={type} {...rest}>
      {loading ? <span className="spinner" /> : icon ? <Icon name={icon} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} /> : null}
    </button>
  );
}
