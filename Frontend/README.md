# Frontend

The frontend of TFH Sermon Hub, built using React.

## Development Notes

### Commands

To start the dev server:

```sh
$ npm run dev
```

To lint the project:

```sh
$ npm run lint
```

### Project Structure

Here's the important files and folders to keep in mind:

- `package.json` – Main project configuration, dependency list, and other info
- `src` – Main project files and pages
    - `src/assets` – Project assets to be optimized (images, audio, and other media)
    - `src/components` – Reusable blocks of HTML/CSS/JS, to be imported and used in other files
        - `src/components/<component>.tsx` – Structure and functionality of a component (HTML + JS)
        - `src/components/<component>.css` – Styling for a component (CSS)
    - `src/lib` – Plain TypeScript files with regular functions, e.g. for querying data, transforming data, etc.
    - `src/main.tsx` – Entrypoint for the app, for any global functionality like routing
    - `src/index.css` – Main stylesheet, applied throughout the entire app
- `public` – Project assets, served as is (favicon, etc.)
    - Unless you have a good reason, most assets should go in `src/assets` instead, so they're optimized

### Creating a New Page

A page is just a function that returns some HTML.

`src/components/MainLayout.tsx` generates the main layout including the sidebar and the header, so every page should use the component. For example, to create a new page called `MyPage` with the title `My Page` and a heading that says "Hello, world!":

```tsx
// src/MyPage.tsx
import MainLayout from '$/components/MainLayout';

export default function MyPage() {
    return (
        <MainLayout title="My Page">
            <h2>Hello, world!</h2>
        </MainLayout>
    );
}
```

(Note: `$/` just refers to the `src` directory.)

---

To apply styles to the page, you should set a `className` on each of the elements you want to style, and then use a `.css` file to actually style them. For example, to make the heading red and italic:

```css
/* src/MyPage.css */
.MainLayout-title {
    color: red;
    font-style: italic;
}
```

```tsx
// src/MyPage.tsx
import './MyPage.css'; // note the new import!
import MainLayout from '$/components/MainLayout';

export default function MyPage() {
    return (
        <MainLayout title="My Page">
            <h2 className="MyPage-heading">Hello, world!</h2> {/* apply the new className to the h2 */}
        </MainLayout>
    );
}
```

### Creating a New Component

The process for creating a new component is almost the same as creating a new page. We just need to put it inside `src/components`. For example, to create a new component called `Hello`:

```tsx
// src/components/Hello.tsx
export default function Hello() {
    return <h2>Hello, world!</h2>;
}
```

Then, we can use this component anywhere else.

```tsx
// src/MyPage.tsx
import MainLayout from '$/components/MainLayout';
import Hello from '$/components/Hello';

export default function MyPage() {
    return (
        <MainLayout title="My Page">
            <Hello />
        </MainLayout>
    );
}
```

---

We can also apply styling as well:

```css
.Hello {
    color: red;
    font-style: italic;
}
```

```tsx
// src/components/Hello.tsx
export default function Hello() {
    return <h2 className="Hello">Hello, world!</h2>;
}
```

---

If we want to, we can also define "props" for a component, which basically lets us "pass arguments" into the component. For example, let's define a `thing` prop on `Hello`, so we can say hello to other things than the world:

```tsx
// src/components/Hello.tsx

// Define our props.
export interface HelloProps {
    thing: string;
}

// Now, our component takes in a props argument of type HelloProps, and we can now access props.thing.
export default function Hello(props: HelloProps) {
    // By wrapping an expression in braces, we can put variables from the function scope into our HTML.
    return <h2 className="Hello">Hello, {props.thing}!</h2>;
}
```

```tsx
// src/MyPage.tsx
import MainLayout from '$/components/MainLayout';
import Hello from '$/components/Hello';

export default function MyPage() {
    return (
        <MainLayout title="My Page">
            <Hello thing="Sermon Hub" /> {/* props are passed in just like with <a href="...">, or any other HTML attribute */}
        </MainLayout>
    );
}
```
