import { useId } from 'react'

/** Decorative Seoul riverside scene, not a geographic route map. */
export function SeoulRideIllustration() {
  const id = useId()
  return <svg className="seoul-ride-illustration" viewBox="0 0 1000 640" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-river`} x1="200" y1="340" x2="760" y2="540" gradientUnits="userSpaceOnUse">
        <stop stopColor="#a2d8da" /><stop offset="1" stopColor="#6ab9c8" />
      </linearGradient>
      <linearGradient id={`${id}-park`} x1="500" y1="320" x2="500" y2="640" gradientUnits="userSpaceOnUse">
        <stop stopColor="#cfe4c3" /><stop offset="1" stopColor="#e5efdb" />
      </linearGradient>
    </defs>
    <circle cx="800" cy="122" r="62" fill="#f5d58d" />
    <circle cx="800" cy="122" r="83" stroke="#f5d58d" strokeOpacity=".3" strokeWidth="14" />
    <g stroke="#fff" strokeWidth="16" strokeLinecap="round" opacity=".8">
      <path d="M92 125h96m-63-14h31M518 85h105m-71-13h36M840 220h86" />
    </g>
    <path d="M0 332c79-24 132-133 224-130 102 3 135 121 245 133l-469 35Z" fill="#c1d5bd" />
    <path d="M0 355c126-17 169-100 230-104 72-5 142 88 248 104Z" fill="#aec8ac" />
    <g stroke="#6e9486" strokeWidth="5" strokeLinejoin="round">
      <path d="M221 229l7-95h13l7 95M235 91v-32" fill="#f6f7ec" />
      <path d="M216 107h37v23h-37zM225 92h20v14h-20z" fill="#e4eee2" />
    </g>
    <g fill="#ccddd4">
      <path d="M344 342V228h58v114M412 346V183h57v163M484 350V254h55v96M549 357V211h48v146M612 361V241h59v120M781 352V218h65v134M859 339V249h72v90" />
      <path d="M699 353l14-206 14-32 14 32 17 206Z" fill="#b9d3c9" />
    </g>
    <g stroke="#f7fbf4" strokeWidth="5" opacity=".9">
      <path d="M358 247v73m14-73v73m15-73v73M427 201v120m15-120v120m14-120v120M563 229v105m17-105v105M796 235v89m16-89v89m16-89v89M718 171v155m14-155v155" />
    </g>
    <path d="M0 354c247-55 430 9 632 13 169 4 251-48 368-50v323H0Z" fill={`url(#${id}-park)`} />
    <path d="M-40 440c227-90 390-34 574-7 213 32 309 1 506-67" stroke={`url(#${id}-river)`} strokeWidth="105" />
    <g stroke="#d7f1ed" strokeWidth="3" strokeLinecap="round" opacity=".85">
      <path d="M17 421h76m34-9h90m102 18h70m51 23h111m120 4h80m53-28h85M56 449h69m89-7h49m260 36h98m103-3h56m93-28h49" />
    </g>
    <g stroke="#7e9f93" strokeLinejoin="round">
      <path d="M555 366l350-12" strokeWidth="10" />
      <path d="M559 365c60-84 113-79 172-5 57-81 110-84 168-6" strokeWidth="5" />
      <path d="M581 345v64m31-89v91m30-104v107m31-100v103m29-81v83m51-84v80m30-99v94m30-101v92m30-77v65m29-38v29" strokeWidth="3" />
    </g>
    <path d="M-40 590c199-163 361-100 560-64 184 33 305 2 520 64" stroke="#faf5df" strokeWidth="58" />
    <path d="M-40 590c199-163 361-100 560-64 184 33 305 2 520 64" stroke="#d4bf84" strokeWidth="3" strokeDasharray="13 17" />
    {[{ x: 87, y: 365, s: 1 }, { x: 137, y: 340, s: .75 }, { x: 903, y: 496, s: 1.2 }, { x: 956, y: 510, s: .8 }, { x: 580, y: 579, s: .6 }].map(({ x, y, s }) => <g key={x} transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cy="34" rx="26" ry="7" fill="#91b796" opacity=".25" />
      <path d="M0-26v57" stroke="#80927a" strokeWidth="7" strokeLinecap="round" />
      <ellipse cy="-34" rx="29" ry="38" fill="#7ba887" /><ellipse cx="-9" cy="-43" rx="17" ry="23" fill="#99bd95" />
    </g>)}
    <g transform="translate(225 497)">
      <ellipse cx="62" cy="25" rx="95" ry="11" fill="#426e58" opacity=".12" />
      <g stroke="#244f47" strokeWidth="6"><circle r="33" fill="#f8fbeb" /><circle cx="113" r="33" fill="#f8fbeb" /></g>
      <path d="M0 0l38-56 35 56H0l69-39 44 39M38-56l-6-14m-14 0h29M92-51l9-19h24" stroke="#13956d" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M71 0L48-36l33-28" stroke="#244f47" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M68-96l-24 36 35 7" stroke="#e9b389" strokeWidth="11" strokeLinecap="round" />
      <path d="M66-101l28 21-15 26-37-9Z" fill="#0d8467" />
      <path d="M88-80l14 22 13-7" stroke="#e9b389" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="83" cy="-120" r="15" fill="#e9b389" />
      <path d="M66-121c-1-24 37-27 36 0Z" fill="#e5ae4f" /><path d="M88-104l10-16" stroke="#244f47" strokeWidth="3" />
    </g>
    <g fill="#f3cf80"><circle cx="166" cy="581" r="4" /><circle cx="178" cy="572" r="3" /><circle cx="758" cy="593" r="4" /><circle cx="771" cy="583" r="3" /></g>
  </svg>
}
