export function Logo({ size = 36, className = '', ...rest }) {
  return (
    <img
      src="/logo.png"
      alt="DGXAI"
      width={size}
      height={size}
      className={`logo-img ${className}`}
      draggable={false}
      {...rest}
    />
  );
}
