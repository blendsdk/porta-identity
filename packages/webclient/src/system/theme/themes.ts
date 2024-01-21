import { makeTheme } from "@blendsdk/fui8";

export const useAppTheme = makeTheme({
    test: {
        palette: {
            themePrimary: "#0078d4",
            themeLighterAlt: "#eff6fc",
            themeLighter: "#deecf9",
            themeLight: "#c7e0f4",
            themeTertiary: "#71afe5",
            themeSecondary: "#2b88d8",
            themeDarkAlt: "#106ebe",
            themeDark: "#005a9e",
            themeDarker: "#004578",
            neutralLighterAlt: "#faf9f8",
            neutralLighter: "#f3f2f1",
            neutralLight: "#edebe9",
            neutralQuaternaryAlt: "#e1dfdd",
            neutralQuaternary: "#d0d0d0",
            neutralTertiaryAlt: "#c8c6c4",
            neutralTertiary: "#a19f9d",
            neutralSecondary: "#605e5c",
            neutralPrimaryAlt: "#3b3a39",
            neutralPrimary: "#323130",
            neutralDark: "#201f1e",
            black: "#000000",
            white: "#ffffff"
        }
    },
    dev: {
        palette: {
            themePrimary: "#5c00d4",
            themeLighterAlt: "#f8f3fd",
            themeLighter: "#e2d0f8",
            themeLight: "#c9a9f2",
            themeTertiary: "#975ce5",
            themeSecondary: "#6d1ad9",
            themeDarkAlt: "#5300be",
            themeDark: "#4600a1",
            themeDarker: "#330077",
            neutralLighterAlt: "#faf9f8",
            neutralLighter: "#f3f2f1",
            neutralLight: "#edebe9",
            neutralQuaternaryAlt: "#e1dfdd",
            neutralQuaternary: "#d0d0d0",
            neutralTertiaryAlt: "#c8c6c4",
            neutralTertiary: "#a19f9d",
            neutralSecondary: "#605e5c",
            neutralPrimaryAlt: "#3b3a39",
            neutralPrimary: "#323130",
            neutralDark: "#201f1e",
            black: "#000000",
            white: "#ffffff"
        }
    },
    prod: {
        palette: {
            themePrimary: "#333333",
            themeLighterAlt: "#f7f7f7",
            themeLighter: "#dedede",
            themeLight: "#c2c2c2",
            themeTertiary: "#858585",
            themeSecondary: "#4b4b4b",
            themeDarkAlt: "#2e2e2e",
            themeDark: "#272727",
            themeDarker: "#1d1d1d",
            neutralLighterAlt: "#f6f6f6",
            neutralLighter: "#f2f2f2",
            neutralLight: "#e8e8e8",
            neutralQuaternaryAlt: "#d8d8d8",
            neutralQuaternary: "#cecece",
            neutralTertiaryAlt: "#c6c6c6",
            neutralTertiary: "#a19f9d",
            neutralSecondary: "#424242", // "#605e5c", // changes the overall text colors!!
            neutralPrimaryAlt: "#3b3a39",
            neutralPrimary: "#323130",
            neutralDark: "#201f1e",
            black: "#000000",
            white: "#fcfcfc"
        }
    }
});
