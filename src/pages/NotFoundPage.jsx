import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <section>
      <h2>Page not found</h2>
      <p>
        The page you requested does not exist. Go back to the <Link to="/">homepage</Link>.
      </p>
    </section>
  );
}
