import * as React from "react"
import { cn } from "cn"
import { ChevronDown } from "lucide-react"
import { Accordion as AccordionPrimitive } from "radix-ui"

function Accordion({ ...props }: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item data-slot="accordion-item" className={cn("border-b", className)} {...props} />
}

function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group/trigger flex min-h-12 flex-1 items-center gap-3 rounded-sm py-3 text-left outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring/50",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/trigger:rotate-180 motion-reduce:transition-none" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

// Stays mounted when closed, so a photo half-way through its taps is still there when the section is opened again.
function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content forceMount data-slot="accordion-content" className={cn("data-[state=closed]:hidden", className)} {...props}>
      {children}
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
