import React, { useState, useEffect, useReducer, useRef } from 'react';
import raw from 'raw.macro';

function useRandomWikiArticles({
  minContentLength,
  length,
  language,
  requestInvalidator,
}) {
  const [loading, setLoading] = useState(false);
  const [randomArticles, setRandomArticles] = useState();
  const [error, setError] = useState();

  useEffect(() => {
    setLoading(true);
    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);

    Object.entries({
      format: 'json',
      action: 'query',
      generator: 'random',
      prop: 'info',
      inprop: 'url',
      grnlimit: 50,
      grnnamespace: 0,
      origin: '*',
    }).forEach(([k, v]) => url.searchParams.set(k, v));

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data?.query?.pages) {
          setLoading(false);
          setRandomArticles(
            Object.values(data.query.pages)
              .filter(
                page =>
                  page.length > minContentLength &&
                  !page.title.startsWith('List of')
              )
              .slice(0, length)
          );
        } else {
          throw new Error(
            "data doesn't fit expected format: " + JSON.stringify(data)
          );
        }
      })
      .catch(e => {
        setLoading(false);
        setError(e);
      });

    return () => {
      setLoading(false);
    };
  }, [minContentLength, requestInvalidator, language, length]);

  return {
    loading,
    error,
    randomArticles,
  };
}

function WikipediaIframe({ article, language }) {
  const iframe = useRef();

  useEffect(() => {
    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);

    Object.entries({
      format: 'json',
      action: 'parse',
      pageid: article.pageid,
      mobileformat: true,
      prop: 'text',
      origin: '*',
    }).forEach(([k, v]) => url.searchParams.set(k, v));

    fetch(url)
      .then(res => res.json())
      .then(res => {
        const document = iframe.current.contentDocument;
        const style = document.createElement('style');
        style.innerHTML = raw('./wikipedia.css');
        document.head.appendChild(style);

        document.body.innerHTML = `
          <base href="https://${language}.wikipedia.org" />
          <h1>${article.title}</h1>
          <div class="siteSub">From Wikipedia, the free encyclopedia</div>
          ${res.parse.text['*']}`;

        document.querySelectorAll('a').forEach(el =>
          el.addEventListener('click', e => {
            if (e.target.href[0] !== '#') {
              e.preventDefault();
            }
          })
        );
      });
  }, [article.pageid, article.title, language]);

  return (
    <iframe
      ref={iframe}
      frameBorder="0"
      title={`Wikipedia page for ${article.title}`}
    />
  );
}

// stage:
// 1. choosing
// 2. reading
// 3. guessing
// 4. recap

function init({ liar, investigator, points }) {
  return {
    liar,
    investigator,
    points,
    stage: 'choosing',
    chosenArticle: null,
    guessCorrect: false,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'choose article': {
      return {
        ...state,
        chosenArticle: action.payload,
        stage: 'reading',
      };
    }
    case 'done reading': {
      return {
        ...state,
        stage: 'preguessing',
      };
    }
    case 'start guessing': {
      return {
        ...state,
        stage: 'guessing',
      };
    }
    case 'guess': {
      const { chosenArticle, liar, investigator, points } = state;
      const guessCorrect = action.payload === chosenArticle;

      return {
        ...state,
        stage: 'recap',
        guessCorrect,
        points: {
          [liar]: guessCorrect ? points[liar] : points[liar] + 1,
          [investigator]: guessCorrect
            ? points[investigator] + 1
            : points[investigator],
        },
      };
    }
    case 'next round': {
      const { investigator, liar, points } = state;
      return init({
        liar: investigator,
        investigator: liar,
        points,
      });
    }
    default: {
      throw new Error('wrong dispatch');
    }
  }
}

function TwoPlayerGame({ names, stop, language }) {
  const [
    { liar, investigator, stage, chosenArticle, guessCorrect, points },
    dispatch,
  ] = useReducer(
    reducer,
    {
      liar: names[0],
      investigator: names[1],
      points: Object.fromEntries(names.map(name => [name, 0])),
    },
    init
  );

  const { loading, error, randomArticles } = useRandomWikiArticles({
    minContentLength: 10_000,
    length: 2,
    requestInvalidator: liar,
    language,
  });

  if (loading) {
    return 'loading…';
  }

  if (error) {
    return 'Error: ' + error.message;
  }

  if (!randomArticles) {
    return 'Error: no data';
  }

  if (stage === 'choosing') {
    return (
      <>
        <p>
          It is now the turn of the liar ({liar}). To read up on one topic,
          please pick one of these articles:
        </p>
        <ul className="box-list">
          {randomArticles.map((article, i) => (
            <li key={article.pageid}>
              <button
                type="button"
                onClick={() =>
                  dispatch({ type: 'choose article', payload: article })
                }
              >
                Article {i + 1}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (stage === 'reading') {
    return (
      <div className="flex-column full-size">
        <WikipediaIframe article={chosenArticle} language={language} />
        <button
          className="done-reading"
          type="button"
          onClick={() => dispatch({ type: 'done reading' })}
        >
          I'm done reading
        </button>
      </div>
    );
  }

  if (stage === 'preguessing') {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={() => dispatch({ type: 'start guessing' })}
        >
          start guessing
        </button>
      </div>
    );
  }

  if (stage === 'guessing') {
    return (
      <>
        <p>
          It is now the turn of the investigator ({investigator}). You now can
          ask questions about all these articles. Once you think you know which
          article the person read, make a guess!
        </p>
        <ul className="box-list">
          {randomArticles.map(article => (
            <li key={article.pageid}>
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: 'guess', payload: article });
                }}
              >
                {article.title}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (stage === 'recap') {
    return (
      <>
        <p>
          {guessCorrect
            ? `The investigator, ${investigator} won! ${liar} did read about ${chosenArticle.title}`
            : `The liar, ${liar} won! ${liar} actually read about ${chosenArticle.title}`}
        </p>
        <p>read the articles:</p>
        <ul className="box-list">
          {randomArticles.map(article => (
            <li key={article.pageid}>
              <a
                href={article.fullurl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {article.title}
              </a>
            </li>
          ))}
        </ul>
        <p>scores:</p>
        <ul className="scores-list">
          {Object.entries(points).map(([name, score]) => (
            <li key={name}>
              {name}: {score}
            </li>
          ))}
        </ul>
        <ul className="box-list">
          <li>
            <button
              type="button"
              onClick={() => dispatch({ type: 'next round' })}
            >
              start next round
            </button>
          </li>
          <li>
            <button class="danger" type="button" onClick={() => stop()}>
              stop playing
            </button>
          </li>
        </ul>
      </>
    );
  }

  return "Error: game stage doesn't exist";
}

function App() {
  const [started, setStarted] = useState(false);
  const [nameOne, setNameOne] = useState();
  const [nameTwo, setNameTwo] = useState();
  const [language] = useState('en');

  const start = () => setStarted(true);
  const stop = () => setStarted(false);

  return (
    <>
      {started ? (
        <TwoPlayerGame
          names={[nameOne, nameTwo]}
          stop={stop}
          language={language}
        />
      ) : (
        <>
          <h1>Read One Article</h1>
          <p>
            In this game, there are two roles: the investigator and liar. Every
            round you will swap between those roles. The liar will be presented
            with two random Wikipedia pages. They will only be able to read one
            of those.
          </p>
          <p>
            Then the investigator will see the titles of both pages, and given
            the opportunity to ask any questions about both.
          </p>
          <p>Will the investigator find out which page the liar made up?</p>
          <p>
            This game was inspired by{' '}
            <a href="https://www.youtube.com/playlist?list=PLfx61sxf1Yz2I-c7eMRk9wBUUDCJkU7H0">
              Two Of These People Are Lying
            </a>{' '}
            by Tom Scott and Matt Grey.
          </p>
          <form
            className="flex-column child-spacing"
            onSubmit={e => {
              e.preventDefault();
              start();
            }}
          >
            <label>
              Player one:{' '}
              <input
                required
                type="text"
                defaultValue={nameOne}
                onChange={e => setNameOne(e.target.value)}
              />
            </label>
            <label>
              Player two:{' '}
              <input
                required
                type="text"
                defaultValue={nameTwo}
                onChange={e => {
                  setNameTwo(e.target.value);

                  if (nameOne === e.target.value) {
                    e.target.setCustomValidity(
                      "Players can't have the same name"
                    );
                  } else {
                    e.target.setCustomValidity('');
                  }
                }}
              />
            </label>
            <button style={{ padding: '.5em' }}>Start!</button>
          </form>
        </>
      )}
    </>
  );
}

export default App;
