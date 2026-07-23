import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Neobrutalist buttons: boxy 8px radius, 2px ink border, hard offset
// shadow. Hover lifts (shadow grows), active presses into the page
// (translate toward the shadow, shadow collapses) — design.md's
// "tactile press". Ghost/link stay flat: no border, no shadow.
const brutal =
  "border-2 border-ink shadow-brut-sm hover:-translate-y-0.5 hover:shadow-brut active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-[transform,box-shadow,background-color,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: `${brutal} bg-ink text-white hover:bg-charcoal`,
        accent: `${brutal} bg-brand text-ink hover:bg-brand-deep`,
        destructive: `${brutal} bg-mark-error text-white hover:bg-mark-error/90`,
        outline: `${brutal} bg-white text-ink hover:bg-surface`,
        secondary: `${brutal} bg-surface text-ink hover:bg-hairline-soft`,
        ghost: "rounded-md text-ink hover:bg-surface",
        link: "text-ink underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-4 text-xs",
        lg: "h-11 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
