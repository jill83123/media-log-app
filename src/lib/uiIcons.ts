import { defineComponent, h, type Component } from 'vue'
import {
  ArrowDown as LArrowDown,
  ArrowUp as LArrowUp,
  Bell as LBell,
  BookOpen as LBookOpen,
  CalendarDays as LCalendarDays,
  ChartNoAxesColumn as LChartNoAxesColumn,
  Check as LCheck,
  ChevronDown as LChevronDown,
  ChevronLeft as LChevronLeft,
  ChevronRight as LChevronRight,
  ChevronUp as LChevronUp,
  Cloud as LCloud,
  Download as LDownload,
  ExternalLink as LExternalLink,
  Eye as LEye,
  EyeOff as LEyeOff,
  Filter as LFilter,
  GripVertical as LGripVertical,
  History as LHistory,
  ImageOff as LImageOff,
  ImagePlus as LImagePlus,
  LayoutGrid as LLayoutGrid,
  Link as LLink,
  Layers as LLayers,
  List as LList,
  GalleryVerticalEnd as LGalleryVerticalEnd,
  LoaderCircle as LLoaderCircle,
  LogOut as LLogOut,
  Minus as LMinus,
  Moon as LMoon,
  Pencil as LPencil,
  Plus as LPlus,
  RefreshCw as LRefreshCw,
  RotateCcw as LRotateCcw,
  Search as LSearch,
  Settings2 as LSettings2,
  SkipBack as LSkipBack,
  SkipForward as LSkipForward,
  Star as LStar,
  Sun as LSun,
  Tag as LTag,
  Trash2 as LTrash2,
  Upload as LUpload,
  X as LX,
} from '@lucide/vue'

/** Interface icons: lucide line icons, a little heavier than the default thin look. */
const light = (icon: Component, name: string) =>
  defineComponent({
    name,
    inheritAttrs: false,
    props: {
      size: { type: [Number, String], default: 24 },
      strokeWidth: { type: [Number, String], default: 2.1 },
    },
    setup(props, { attrs }) {
      return () => h(icon, { ...attrs, size: props.size, strokeWidth: props.strokeWidth })
    },
  })

export const GripVertical = light(LGripVertical, 'GripVertical')
export const ArrowDown = light(LArrowDown, 'ArrowDown')
export const ArrowUp = light(LArrowUp, 'ArrowUp')
export const Bell = light(LBell, 'Bell')
export const BookOpen = light(LBookOpen, 'BookOpen')
export const CalendarDays = light(LCalendarDays, 'CalendarDays')
export const ChartNoAxesColumn = light(LChartNoAxesColumn, 'ChartNoAxesColumn')
export const Check = light(LCheck, 'Check')
export const ChevronDown = light(LChevronDown, 'ChevronDown')
export const ChevronLeft = light(LChevronLeft, 'ChevronLeft')
export const ChevronRight = light(LChevronRight, 'ChevronRight')
export const ChevronUp = light(LChevronUp, 'ChevronUp')
export const Cloud = light(LCloud, 'Cloud')
export const LogOut = light(LLogOut, 'LogOut')
export const Download = light(LDownload, 'Download')
export const Link = light(LLink, 'Link')
export const ExternalLink = light(LExternalLink, 'ExternalLink')
export const Eye = light(LEye, 'Eye')
export const EyeOff = light(LEyeOff, 'EyeOff')
export const Filter = light(LFilter, 'Filter')
export const History = light(LHistory, 'History')
export const ImageOff = light(LImageOff, 'ImageOff')
export const ImagePlus = light(LImagePlus, 'ImagePlus')
export const LayoutGrid = light(LLayoutGrid, 'LayoutGrid')
export const List = light(LList, 'List')
export const Layers = light(LLayers, 'Layers')
export const LoaderCircle = light(LLoaderCircle, 'LoaderCircle')
export const Minus = light(LMinus, 'Minus')
export const Moon = light(LMoon, 'Moon')
export const Pencil = light(LPencil, 'Pencil')
export const Plus = light(LPlus, 'Plus')
export const RefreshCw = light(LRefreshCw, 'RefreshCw')
export const RotateCcw = light(LRotateCcw, 'RotateCcw')
export const Search = light(LSearch, 'Search')
export const SkipBack = light(LSkipBack, 'SkipBack')
export const SkipForward = light(LSkipForward, 'SkipForward')
export const Star = light(LStar, 'Star')
export const Sun = light(LSun, 'Sun')
export const Tag = light(LTag, 'Tag')
export const Trash2 = light(LTrash2, 'Trash2')
export const Upload = light(LUpload, 'Upload')
export const X = light(LX, 'X')

// bottom navigation
export const Settings2 = light(LSettings2, 'Settings2')
export const NavLibrary = light(LGalleryVerticalEnd, 'NavLibrary')
export const GalleryVerticalEnd = light(LGalleryVerticalEnd, 'GalleryVerticalEnd')
export const NavStats = light(LChartNoAxesColumn, 'NavStats')
export const NavCalendar = light(LCalendarDays, 'NavCalendar')
export const NavSearch = light(LSearch, 'NavSearch')
export const NavSettings = light(LSettings2, 'NavSettings')
