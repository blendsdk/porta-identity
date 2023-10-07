import { BrandVariants, Theme, createDarkTheme, createLightTheme } from "@fluentui/react-components";

const portaTheme: BrandVariants = {
    10: "#030303",
    20: "#171717",
    30: "#252525",
    40: "#313131",
    50: "#3D3D3D",
    60: "#494949",
    70: "#565656",
    80: "#636363",
    90: "#717171",
    100: "#7F7F7F",
    110: "#8D8D8D",
    120: "#9B9B9B",
    130: "#AAAAAA",
    140: "#B9B9B9",
    150: "#C8C8C8",
    160: "#D7D7D7"
};

export const lightTheme: Theme = {
    ...createLightTheme(portaTheme)
};

export const darkTheme: Theme = {
    ...createDarkTheme(portaTheme)
};

darkTheme.colorBrandForeground1 = portaTheme[110];
darkTheme.colorBrandForeground2 = portaTheme[120];
