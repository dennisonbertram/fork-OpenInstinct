"use client";

import { useState, type ButtonHTMLAttributes } from "react";
import { SignupDialog } from "./signup-dialog";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  postRequest?: (email: string) => Promise<void>;
};

export function SignupButton({ postRequest, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const { onClick, ...rest } = props;
  return (
    <>
      <button
        type="button"
        {...rest}
        onClick={(e) => {
          setOpen(true);
          onClick?.(e);
        }}
      />
      {open && (
        <SignupDialog
          open={open}
          onClose={() => setOpen(false)}
          postRequest={postRequest}
        />
      )}
    </>
  );
}
