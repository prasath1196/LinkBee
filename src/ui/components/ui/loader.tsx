import { cn } from "../../lib/utils"

export function Spinner({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("animate-spin", className)}
        >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    )
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("animate-pulse rounded-md bg-muted/50", className)}
            {...props}
        />
    )
}

export function ListSkeleton() {
    return (
        <div className="space-y-4">
            {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between">
                        <Skeleton className="h-4 w-[200px]" />
                        <Skeleton className="h-4 w-8" />
                    </div>
                    <Skeleton className="h-16 w-full" />
                    <div className="flex justify-between">
                        <Skeleton className="h-4 w-16" />
                        <div className="flex gap-2">
                            <Skeleton className="h-7 w-12" />
                            <Skeleton className="h-7 w-20" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
