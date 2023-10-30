/**
 * Converts seconds to milliseconds
 */
export const secondsToMilliseconds = (seconds: number) => seconds * 1000;
/**
 * Create an expire timestamp from now
 * @param seconds
 * @returns
 */
export const expireSecondsFromNow = (seconds: number) => Date.now() + secondsToMilliseconds(seconds);

export const millisecondsToSeconds = (milliseconds: number) => Math.trunc(milliseconds / 1000);

export const renderGetRedirect = (url: string, delay?: number) => {
    return `<html>
        <style>
        #html-spinner{
            width:32px;
            height:32px;
            border:2px solid #c9c9c9;
            border-top:2px solid white;
            border-radius:50%;
          }

          #html-spinner{
            -webkit-transition-property: -webkit-transform;
            -webkit-transition-duration: 1.2s;
            -webkit-animation-name: rotate;
            -webkit-animation-iteration-count: infinite;
            -webkit-animation-timing-function: linear;

            -moz-transition-property: -moz-transform;
            -moz-animation-name: rotate;
            -moz-animation-duration: 1.2s;
            -moz-animation-iteration-count: infinite;
            -moz-animation-timing-function: linear;

            transition-property: transform;
            animation-name: rotate;
            animation-duration: 1.2s;
            animation-iteration-count: infinite;
            animation-timing-function: linear;
          }

          @-webkit-keyframes rotate {
              from {-webkit-transform: rotate(0deg);}
              to {-webkit-transform: rotate(360deg);}
          }

          @-moz-keyframes rotate {
              from {-moz-transform: rotate(0deg);}
              to {-moz-transform: rotate(360deg);}
          }

          @keyframes rotate {
              from {transform: rotate(0deg);}
              to {transform: rotate(360deg);}
          }


          /* Rest of page style*/
          body{
            background:#ffffff;
            font-family: 'Open Sans', sans-serif;
            -webkit-font-smoothing: antialiased;
            color:#c9c9c9;
          }


          #html-spinner {
            position:absolute;
            top:50%;
            left:50%;
          }
        </style>
        <body>
            <div id="html-spinner"></div>
        </body>
        <script>
           setTimeout(()=>{
                window.location.href="${url}";
           },${delay} || 0)
        </script>
    </html>`;
};
