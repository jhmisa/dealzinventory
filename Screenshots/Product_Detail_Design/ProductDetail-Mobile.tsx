// Product Detail Page — Mobile View (390px)
// Design exported from Paper
// Stack: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
//
// Notes for coding agent:
// - Replace inline SVG icons with lucide-react icons (Edit, Image, Video, Trash2, ChevronLeft, ChevronRight, Maximize2, GripVertical)
// - Replace hardcoded data with props/API data
// - Use shadcn/ui Button component for action buttons
// - Use shadcn/ui Tabs component for Photos/Videos tabs
// - Implement drag-to-reorder on thumbnails using @dnd-kit/sortable
// - The first thumbnail = main display image (swipeable)
// - Click expand icon on hero = lightbox/fullscreen view
// - This is the mobile (<768px) layout, see ProductDetail-Desktop.tsx for desktop (>=1024px)
// - Buttons are boxy (no border-radius), segmented control style

export function ProductDetailMobile() {
  return (
    <div className="[font-synthesis:none] text-[12px] leading-4 flex overflow-clip w-[390px] h-fit flex-col pb-5 bg-white antialiased">
      <div className="flex items-center justify-between w-full py-3 px-5 border-b border-b-solid border-b-[#E4E4E7]">
        <div className="flex items-center gap-2.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <div className="text-[15px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-[18px]">
            Product Detail
          </div>
        </div>
        <div className="flex items-center justify-center rounded-[50%] bg-[#18181B] shrink-0 size-7">
          <div className="text-[11px] inline-block text-white font-['Geist',system-ui,sans-serif] font-semibold leading-3.5">
            JM
          </div>
        </div>
      </div>
      <div className="flex flex-col w-full pt-4 pb-1 gap-1.5 px-5">
        <div className="flex items-center gap-2">
          <div className="text-[10px] tracking-[0.08em] uppercase inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-3">
            Active
          </div>
          <div className="w-[3px] h-[3px] rounded-[50%] bg-[#D4D4D8] shrink-0" />
          <div className="text-[10px] tracking-[0.08em] uppercase inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] font-medium leading-3">
            Computer
          </div>
        </div>
        <div className="text-[24px] leading-[30px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-bold">
          AirPods Pro
        </div>
        <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
          MWP22J/A · White
        </div>
        <div className="text-[13px] pt-1 inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
          Apple AirPods Pro MWP22J/A, White, 16GB
        </div>
      </div>
      <div className="flex w-full pt-3 pb-4 px-5">
        <div className="flex items-center justify-center grow shrink basis-[0%] py-2 gap-[5px] bg-[#18181B]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <div className="text-[12px] inline-block text-white font-['Geist',system-ui,sans-serif] font-medium leading-4">
            Edit
          </div>
        </div>
        <div className="flex items-center justify-center grow shrink basis-[0%] py-2 gap-[5px] bg-white border-t border-t-solid border-t-[#E4E4E7] border-b border-b-solid border-b-[#E4E4E7] border-r border-r-solid border-r-[#E4E4E7]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <div className="text-[12px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-4">
            Photo
          </div>
        </div>
        <div className="flex items-center justify-center grow shrink basis-[0%] py-2 gap-[5px] bg-white border-t border-t-solid border-t-[#E4E4E7] border-b border-b-solid border-b-[#E4E4E7] border-r border-r-solid border-r-[#E4E4E7]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          <div className="text-[12px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-4">
            Video
          </div>
        </div>
        <div className="flex items-center justify-center grow shrink basis-[0%] py-2 gap-[5px] bg-white border border-solid border-[#E4E4E7]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <div className="text-[12px] inline-block text-[#EF4444] font-['Geist',system-ui,sans-serif] font-medium leading-4">
            Delete
          </div>
        </div>
      </div>
      <div className="w-full h-[300px] flex items-center justify-center relative bg-[#F4F4F5] shrink-0">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        <div className="absolute left-3 top-[50%] flex items-center justify-center rounded-[50%] bg-[#FFFFFFE6] size-8">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </div>
        <div className="absolute right-3 top-[50%] flex items-center justify-center rounded-[50%] bg-[#FFFFFFE6] size-8">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
        <div className="absolute top-2.5 right-2.5 flex items-center justify-center rounded-md bg-[#FFFFFFE6] size-7">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </div>
      </div>
      <div className="flex flex-col w-full pt-2.5 gap-2.5 px-5">
        <div className="flex border-b border-b-solid border-b-[#E4E4E7]">
          <div className="pr-3 border-b-2 border-b-solid border-b-[#18181B] py-1.5">
            <div className="inline-block text-[16px] text-black font-sans leading-5">
              Photos (04)
            </div>
          </div>
          <div className="text-[16px] text-black font-sans leading-5 py-1.5 px-3">
            Videos (0)
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-[72px] h-[60px] flex items-center justify-center shrink-0 relative rounded-md bg-[#F4F4F5] border-2 border-solid border-[#18181B]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <div className="absolute top-1 left-1 flex flex-col opacity-[0.5] gap-[1.5px]">
              <div className="flex gap-[1.5px]">
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
              </div>
              <div className="flex gap-[1.5px]">
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
              </div>
              <div className="flex gap-[1.5px]">
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
              </div>
            </div>
          </div>
          <div className="w-[72px] h-[60px] flex items-center justify-center shrink-0 relative rounded-md bg-[#F4F4F5]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <div className="absolute top-1 left-1 flex flex-col opacity-[0.5] gap-[1.5px]">
              <div className="flex gap-[1.5px]">
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
              </div>
              <div className="flex gap-[1.5px]">
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
              </div>
              <div className="flex gap-[1.5px]">
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
              </div>
            </div>
          </div>
          <div className="w-[72px] h-[60px] flex items-center justify-center shrink-0 relative rounded-md bg-[#F4F4F5]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <div className="absolute top-1 left-1 flex flex-col opacity-[0.5] gap-[1.5px]">
              <div className="flex gap-[1.5px]">
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
              </div>
              <div className="flex gap-[1.5px]">
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
              </div>
              <div className="flex gap-[1.5px]">
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
              </div>
            </div>
          </div>
          <div className="w-[72px] h-[60px] flex items-center justify-center shrink-0 relative rounded-md bg-[#F4F4F5]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <div className="absolute top-1 left-1 flex flex-col opacity-[0.5] gap-[1.5px]">
              <div className="flex gap-[1.5px]">
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
              </div>
              <div className="flex gap-[1.5px]">
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
              </div>
              <div className="flex gap-[1.5px]">
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
                <div className="w-[2.5px] h-[2.5px] rounded-[50%] bg-[#71717A] shrink-0" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col w-full pt-4 px-5">
        <div className="text-[12px] pb-2.5 inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-4">
          Specifications
        </div>
        <div className="flex justify-between py-[9px] border-t border-t-solid border-t-[#F4F4F5]">
          <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">Brand</div>
          <div className="text-[13px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-4">Apple</div>
        </div>
        <div className="flex justify-between py-[9px] border-t border-t-solid border-t-[#F4F4F5]">
          <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">Model</div>
          <div className="text-[13px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-4">AirPods Pro MWP22J/A</div>
        </div>
        <div className="flex justify-between py-[9px] border-t border-t-solid border-t-[#F4F4F5]">
          <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">Color</div>
          <div className="text-[13px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-4">White</div>
        </div>
        <div className="flex justify-between py-[9px] border-t border-t-solid border-t-[#F4F4F5]">
          <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">Category</div>
          <div className="text-[13px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-4">Computer</div>
        </div>
      </div>
      <div className="flex flex-col w-full pt-3 px-5">
        <div className="text-[12px] pb-2.5 inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-4">
          Configuration
        </div>
        <div className="flex justify-between py-[9px] border-t border-t-solid border-t-[#F4F4F5]">
          <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">CPU</div>
          <div className="text-[13px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">--</div>
        </div>
        <div className="flex justify-between py-[9px] border-t border-t-solid border-t-[#F4F4F5]">
          <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">OS Family</div>
          <div className="text-[13px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">--</div>
        </div>
        <div className="flex justify-between py-[9px] border-t border-t-solid border-t-[#F4F4F5]">
          <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">GPU</div>
          <div className="text-[13px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">--</div>
        </div>
        <div className="flex justify-between py-[9px] border-t border-t-solid border-t-[#F4F4F5]">
          <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">Keyboard Layout</div>
          <div className="text-[13px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">--</div>
        </div>
      </div>
      <div className="flex flex-col w-full pt-3 px-5">
        <div className="text-[12px] pb-2.5 inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-4">
          Hardware
        </div>
        <div className="flex justify-between py-[9px] border-t border-t-solid border-t-[#F4F4F5]">
          <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">Screen Size</div>
          <div className="text-[13px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">--</div>
        </div>
        <div className="flex justify-between py-[9px] border-t border-t-solid border-t-[#F4F4F5]">
          <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">Touchscreen</div>
          <div className="text-[13px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-4">No</div>
        </div>
        <div className="flex justify-between py-[9px] border-t border-t-solid border-t-[#F4F4F5]">
          <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">Thunderbolt</div>
          <div className="text-[13px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-4">No</div>
        </div>
        <div className="flex justify-between py-[9px] border-t border-t-solid border-t-[#F4F4F5]">
          <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">Ports</div>
          <div className="text-[13px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">--</div>
        </div>
      </div>
    </div>
  );
}
