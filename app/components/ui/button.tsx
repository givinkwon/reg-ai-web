'use client';

import * as React from 'react';
import cls from './button.module.css';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'md', ...props }, ref) => {
    const v = variant === 'outline' ? cls.vOutline : variant === 'ghost' ? cls.vGhost : cls.vDefault;
    const s = size === 'sm' ? cls.sSm : size === 'lg' ? cls.sLg : cls.sMd;

    return (
      <button
        ref={ref}
        className={`${cls.base} ${v} ${s} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export default Button;
