"use client";

/* Plain email input. No native browser validation — all validation and error
   messages are handled in-app (see lib/email.ts + each form), so the browser
   never shows its own OS-language bubble. Uses `type="text"` + inputMode to
   suppress native constraint UI while keeping the email keyboard on mobile. */
type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  autoComplete?: string;
  id?: string;
  name?: string;
  placeholder?: string;
};

export default function EmailInput({
  value,
  onChange,
  className = "",
  autoComplete,
  id,
  name,
  placeholder,
}: Props) {
  return (
    <input
      type="text"
      inputMode="email"
      id={id}
      name={name}
      className={`sa-input ${className}`}
      value={value}
      autoComplete={autoComplete}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
